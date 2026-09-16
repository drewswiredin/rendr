import { appendFileSync } from "node:fs";
import { pipeJsonRender } from "@json-render/core";
import {
  createAgentUIStream,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateText,
  type UIMessage,
  validateUIMessages,
} from "ai";
import { after } from "next/server";
import { z } from "zod";
import { createAgent, type RendrUIMessage } from "@/lib/ai/agent";
import { resolveModelId } from "@/lib/ai/models";
import { titlePrompt } from "@/lib/ai/prompts";
import { getTitleModel } from "@/lib/ai/providers";
import {
  createChat,
  getChat,
  saveMessages,
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

async function generateTitle(message: UIMessage): Promise<string> {
  try {
    const { text } = await generateText({
      model: getTitleModel(),
      system: titlePrompt,
      prompt: `First message:\n"""\n${textOf(message).slice(0, 2000)}\n"""\n\nTitle:`,
    });
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
  const { id, modelId, pieces } = parsed.data;
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
      await updateChatTitle({ id, title: await generateTitle(last) });
    });
  }

  await saveMessages({ chatId: id, messages: [last] });

  const agent = createAgent({
    modelId: resolveModelId(modelId),
    chatId: id,
    guestId,
    pieceContext: pieces?.length
      ? pieces
          .map(
            (p) =>
              `- "${p.title}" (id ${p.artifactId}): ${p.text.slice(0, 4000)}`,
          )
          .join("\n")
      : undefined,
  });

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
      const agentStream = await createAgentUIStream({
        agent,
        uiMessages: await inlineAttachments(messages, guestId),
        // The provider error is turned into an error chunk here, before the
        // outer stream sees it, so the mapping has to be applied here too.
        onError: describeError,
      });
      writer.merge(pipeJsonRender(repairSpecLines(debugTap(agentStream, id))));
    },
  });

  return createUIMessageStreamResponse({ stream });
}
