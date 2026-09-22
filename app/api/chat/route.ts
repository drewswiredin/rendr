import { appendFileSync } from "node:fs";
import { pipeJsonRender } from "@json-render/core";
import {
  createAgentUIStream,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateText,
  type InferUIMessageChunk,
  type UIMessage,
  validateUIMessages,
} from "ai";
import { after } from "next/server";
import { z } from "zod";
import { createAgent, type RendrUIMessage } from "@/lib/ai/agent";
import { researchServerLines, streamClaude } from "@/lib/ai/claude/stream";
import { generateClaudeTitle } from "@/lib/ai/claude/title";
import {
  researchServerLines as codexResearchServerLines,
  streamCodex,
} from "@/lib/ai/codex/stream";
import { generateCodexTitle } from "@/lib/ai/codex/title";
import { beginLiveStream, publishLiveStream } from "@/lib/ai/live-streams";
import { type ChatModel, getChatModel, resolveModelId } from "@/lib/ai/models";
import { buildSystemPrompt, titlePrompt } from "@/lib/ai/prompts";
import { getTitleModel } from "@/lib/ai/providers";
import { artifactTools } from "@/lib/ai/tools/artifacts";
import {
  createChat,
  getChat,
  saveMessages,
  setChatClaudeSession,
  setChatCodexThread,
  updateChatTitle,
} from "@/lib/db/queries";
import { getGuestId } from "@/lib/guest";
import { repairSpecLines } from "@/lib/ui/spec-repair";
import { readUpload, uploadIdFromUrl } from "@/lib/uploads/store";

export const maxDuration = 120;

const bodySchema = z.object({
  id: z.string().min(1),
  messages: z.array(z.unknown()).min(1),
  modelId: z.string().optional(),
  // State reported by interactive pieces on the stage (rendr.setContext()).
  pieces: z
    .array(
      z.object({ artifactId: z.string(), title: z.string(), text: z.string() }),
    )
    .optional(),
});

function textOf(message: UIMessage): string {
  return message.parts
    .filter((p) => p.type === "text")
    .map((p) => p.text)
    .join("\n");
}

async function generateTitle(
  message: UIMessage,
  model: ChatModel,
): Promise<string> {
  try {
    const first = textOf(message).slice(0, 2000);
    const text =
      model.backend === "claude"
        ? await generateClaudeTitle(first)
        : model.backend === "codex"
          ? await generateCodexTitle(first)
          : (
              await generateText({
                model: getTitleModel(),
                system: titlePrompt,
                prompt: `First message:\n"""\n${first}\n"""\n\nTitle:`,
              })
            ).text;
    const title = text
      .trim()
      .split("\n")[0]
      .replace(/^["']|["'.]$/g, "");
    return title.slice(0, 80) || "New chat";
  } catch {
    return "New chat";
  }
}

// Surface the provider's reason (rate limit, credits, model unavailable) to the
// user instead of the SDK's default "An error occurred".
function describeError(error: unknown): string {
  if (error && typeof error === "object") {
    const e = error as {
      statusCode?: number;
      data?: { error?: { message?: string } };
      message?: string;
    };
    const providerMessage = e.data?.error?.message;
    if (providerMessage) {
      return e.statusCode
        ? `${providerMessage} (HTTP ${e.statusCode})`
        : providerMessage;
    }
    if (typeof e.message === "string" && e.message) {
      return e.message;
    }
  }
  return "Something went wrong while generating the reply.";
}

// Stored attachments are referenced by short URLs in the persisted messages;
// the model needs the bytes, so inline them as data URLs for the call only.
async function inlineAttachments(
  messages: RendrUIMessage[],
  guestId: string,
): Promise<RendrUIMessage[]> {
  return Promise.all(
    messages.map(async (message) => ({
      ...message,
      parts: await Promise.all(
        message.parts.map(async (part) => {
          if (part.type !== "file") {
            return part;
          }
          const id = uploadIdFromUrl(part.url);
          if (!id) {
            return part;
          }
          const found = await readUpload({ id, guestId });
          if (!found) {
            return {
              type: "text" as const,
              text: `[attachment unavailable: ${part.filename ?? id}]`,
            };
          }
          const base64 = Buffer.from(found.bytes).toString("base64");
          return {
            ...part,
            url: `data:${found.row.mediaType};base64,${base64}`,
          };
        }),
      ),
    })),
  );
}

// RENDR_DEBUG_STREAM=1 appends every raw text delta to data/stream-<chat>.log
// before the json-render transform sees it — the only way to see what the
// model literally wrote when a spec fails to render.
function debugTap<T>(
  stream: ReadableStream<T>,
  chatId: string,
): ReadableStream<T> {
  if (process.env.RENDR_DEBUG_STREAM !== "1") {
    return stream;
  }
  const file = `data/stream-${chatId}.log`;
  appendFileSync(file, `\n\n===== ${new Date().toISOString()}\n`);
  return stream.pipeThrough(
    new TransformStream<T, T>({
      transform(chunk, controller) {
        const c = chunk as { type?: string; delta?: string };
        if (c.type === "text-delta" && typeof c.delta === "string") {
          appendFileSync(file, c.delta);
        }
        controller.enqueue(chunk);
      },
    }),
  );
}

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "bad request" }, { status: 400 });
  }

  const guestId = await getGuestId();
  const { id, pieces } = parsed.data;
  const model = getChatModel(resolveModelId(parsed.data.modelId));
  const messages = (await validateUIMessages({
    messages: parsed.data.messages,
  })) as RendrUIMessage[];
  const last = messages.at(-1);
  if (!last || last.role !== "user") {
    return Response.json(
      { error: "last message must be from user" },
      { status: 400 },
    );
  }

  const existing = await getChat({ id, guestId });
  if (!existing) {
    await createChat({ id, guestId });
    after(async () => {
      await updateChatTitle({ id, title: await generateTitle(last, model) });
    });
  }

  await saveMessages({ chatId: id, messages: [last] });

  const pieceContext = pieces?.length
    ? pieces
        .map(
          (p) =>
            `- "${p.title}" (id ${p.artifactId}): ${p.text.slice(0, 4000)}`,
        )
        .join("\n")
    : undefined;

  // The reply outlives this request (see lib/ai/live-streams): generation is
  // stopped by the stop button, not by the browser leaving the page.
  const abort = beginLiveStream(id);

  // The two backends produce the same chunk stream: the AI SDK agent loop on
  // OpenRouter, or the Claude Agent SDK on the owner's Claude plan.
  const agentStream = async (): Promise<
    ReadableStream<InferUIMessageChunk<RendrUIMessage>>
  > => {
    const uiMessages = await inlineAttachments(messages, guestId);
    if (model.backend === "codex") {
      // Untyped on this path too; same text/reasoning/tool chunks.
      return streamCodex({
        model: model.backendModel,
        systemPrompt: buildSystemPrompt({
          mcpServers: codexResearchServerLines(),
        }),
        messages: uiMessages,
        tools: artifactTools({ chatId: id, guestId }),
        threadId: existing?.codexThreadId ?? null,
        pieceContext,
        onThread: (threadId) => setChatCodexThread({ id, threadId }),
        abortSignal: abort.signal,
      }) as ReadableStream<InferUIMessageChunk<RendrUIMessage>>;
    }
    if (model.backend === "claude") {
      // The chunk stream is untyped on this path; it carries the same
      // text/reasoning/tool chunks the agent stream does.
      return streamClaude({
        modelId: model.id,
        systemPrompt: buildSystemPrompt({ mcpServers: researchServerLines() }),
        messages: uiMessages,
        tools: artifactTools({ chatId: id, guestId }),
        sessionId: existing?.claudeSessionId ?? null,
        pieceContext,
        onSession: (sessionId) => setChatClaudeSession({ id, sessionId }),
        abortSignal: abort.signal,
      }) as ReadableStream<InferUIMessageChunk<RendrUIMessage>>;
    }
    const agent = await createAgent({
      modelId: model.id,
      chatId: id,
      guestId,
      pieceContext,
    });
    return createAgentUIStream({
      agent,
      uiMessages,
      abortSignal: abort.signal,
      // The provider error is turned into an error chunk here, before the
      // outer stream sees it, so the mapping has to be applied here too.
      onError: describeError,
    });
  };

  // The agent's stream passes through json-render's transform, which lifts
  // inline ```spec JSONL out of the text into data-spec parts; persistence
  // then stores the transformed parts so a reload re-renders the UI.
  const stream = createUIMessageStream<RendrUIMessage>({
    originalMessages: messages,
    generateId: () => crypto.randomUUID(),
    onError: describeError,
    onEnd: async ({ responseMessage }) => {
      await saveMessages({ chatId: id, messages: [responseMessage] });
    },
    execute: async ({ writer }) => {
      writer.merge(
        pipeJsonRender(repairSpecLines(debugTap(await agentStream(), id))),
      );
    },
  });

  return createUIMessageStreamResponse({
    stream,
    consumeSseStream: ({ stream: copy }) => publishLiveStream(id, copy),
  });
}
