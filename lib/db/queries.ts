import "server-only";

import type { UIMessage } from "ai";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from ".";
import { chat, message } from "./schema";

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
