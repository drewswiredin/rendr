import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { Chat } from "@/components/chat/chat";
import {
  EFFORT_COOKIE,
  getChatModel,
  MODEL_COOKIE,
  resolveEffort,
  resolveModelId,
} from "@/lib/ai/models";
import { listArtifacts } from "@/lib/artifacts/store";
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
  const [messages, artifacts, store] = await Promise.all([
    getMessages({ chatId: id }),
    listArtifacts({ chatId: id }),
    cookies(),
  ]);
  // What this chat last ran with, falling back to the last choice made
  // anywhere for a chat that has not had a turn yet.
  const modelId = resolveModelId(
    chat.modelId ?? store.get(MODEL_COOKIE)?.value,
  );
  const model = getChatModel(modelId);
  const effort = resolveEffort(
    model,
    chat.effort ?? store.get(EFFORT_COOKIE)?.value,
  );
  return (
    <Chat
      id={id}
      initialArtifacts={artifacts}
      initialEffort={effort}
      initialMessages={messages}
      initialModelId={modelId}
      key={id}
    />
  );
}
