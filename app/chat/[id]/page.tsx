import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { Chat } from "@/components/chat/chat";
import { MODEL_COOKIE, resolveModelId } from "@/lib/ai/models";
import { getChat, getMessages } from "@/lib/db/queries";
import { getGuestId } from "@/lib/guest";

export default async function ChatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const guestId = await getGuestId();
  const chat = await getChat({ id, guestId });
  if (!chat) {
    notFound();
  }
  const [messages, store] = await Promise.all([
    getMessages({ chatId: id }),
    cookies(),
  ]);
  const modelId = resolveModelId(store.get(MODEL_COOKIE)?.value);
  return <Chat id={id} initialMessages={messages} initialModelId={modelId} />;
}
