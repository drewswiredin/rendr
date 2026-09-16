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

export const maxDuration = 120;

const bodySchema = z.object({
  id: z.string().min(1),
  messages: z.array(z.unknown()).min(1),
  modelId: z.string().optional(),
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

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "bad request" }, { status: 400 });
  }

  const guestId = await getGuestId();
  const { id, modelId } = parsed.data;
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
        uiMessages: messages,
        // The provider error is turned into an error chunk here, before the
        // outer stream sees it, so the mapping has to be applied here too.
        onError: describeError,
      });
      writer.merge(pipeJsonRender(agentStream));
    },
  });

  return createUIMessageStreamResponse({ stream });
}
