import "server-only";

import type { UIMessage } from "ai";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { TurnUsage } from "@/lib/ai/usage";
import { db } from ".";
import { chat, message, usage } from "./schema";

export async function getChat({
  id,
  guestId,
}: {
  id: string;
  guestId: string;
}) {
  return db.query.chat.findFirst({
    where: and(eq(chat.id, id), eq(chat.guestId, guestId)),
  });
}

export async function listChats({ guestId }: { guestId: string }) {
  return db.query.chat.findMany({
    where: eq(chat.guestId, guestId),
    orderBy: desc(chat.createdAt),
  });
}

export async function createChat({
  id,
  guestId,
  title,
}: {
  id: string;
  guestId: string;
  title?: string;
}) {
  await db.insert(chat).values({ id, guestId, title });
}

export async function updateChatTitle({
  id,
  title,
}: {
  id: string;
  title: string;
}) {
  await db.update(chat).set({ title }).where(eq(chat.id, id));
}

export async function setChatClaudeSession({
  id,
  sessionId,
}: {
  id: string;
  sessionId: string | null;
}) {
  await db
    .update(chat)
    .set({ claudeSessionId: sessionId })
    .where(eq(chat.id, id));
}

export async function setChatCodexThread({
  id,
  threadId,
}: {
  id: string;
  threadId: string | null;
}) {
  await db.update(chat).set({ codexThreadId: threadId }).where(eq(chat.id, id));
}

export async function setChatModel({
  id,
  modelId,
  effort,
}: {
  id: string;
  modelId: string;
  effort: string;
}) {
  await db.update(chat).set({ modelId, effort }).where(eq(chat.id, id));
}

export async function deleteChat({
  id,
  guestId,
}: {
  id: string;
  guestId: string;
}) {
  await db.delete(chat).where(and(eq(chat.id, id), eq(chat.guestId, guestId)));
}

export async function getMessages({ chatId }: { chatId: string }) {
  const rows = await db.query.message.findMany({
    where: eq(message.chatId, chatId),
    orderBy: asc(message.createdAt),
  });
  return rows.map(
    (row): UIMessage => ({
      id: row.id,
      role: row.role,
      parts: row.parts as UIMessage["parts"],
    }),
  );
}

export async function saveMessages({
  chatId,
  messages,
}: {
  chatId: string;
  messages: UIMessage[];
}) {
  if (messages.length === 0) {
    return;
  }
  await db
    .insert(message)
    .values(
      messages.map((m) => ({
        id: m.id,
        chatId,
        role: m.role,
        parts: m.parts,
      })),
    )
    .onConflictDoUpdate({
      target: message.id,
      set: { parts: sql`excluded.parts` },
    });
}

export async function saveUsage({
  chatId,
  messageId,
  turn,
}: {
  chatId: string;
  messageId: string | null;
  turn: TurnUsage;
}) {
  await db.insert(usage).values({
    id: crypto.randomUUID(),
    chatId,
    messageId,
    modelId: turn.modelId,
    inputTokens: turn.inputTokens,
    outputTokens: turn.outputTokens,
    reasoningTokens: turn.reasoningTokens ?? 0,
    cacheReadTokens: turn.cacheReadTokens ?? 0,
    cacheWriteTokens: turn.cacheWriteTokens ?? 0,
    costUsd: turn.costUsd,
    billed: turn.billed,
  });
}

export type ChatUsageRow = {
  modelId: string;
  billed: boolean;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  costUsd: number | null;
  calls: number;
};

// One row per model this chat has used, so a chat that switched models shows
// where the tokens went rather than a single blended number.
export async function getChatUsage({
  chatId,
}: {
  chatId: string;
}): Promise<ChatUsageRow[]> {
  const rows = await db
    .select({
      modelId: usage.modelId,
      billed: usage.billed,
      inputTokens: sql<number>`sum(${usage.inputTokens})`,
      outputTokens: sql<number>`sum(${usage.outputTokens})`,
      reasoningTokens: sql<number>`sum(${usage.reasoningTokens})`,
      costUsd: sql<number | null>`sum(${usage.costUsd})`,
      calls: sql<number>`count(*)`,
    })
    .from(usage)
    .where(eq(usage.chatId, chatId))
    .groupBy(usage.modelId, usage.billed)
    .orderBy(desc(sql`sum(${usage.costUsd})`));
  return rows.map((r) => ({ ...r, billed: Boolean(r.billed) }));
}
