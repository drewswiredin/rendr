import { cookies } from "next/headers";
import { Chat } from "@/components/chat/chat";
import { MODEL_COOKIE, resolveModelId } from "@/lib/ai/models";

export default async function NewChatPage() {
  const store = await cookies();
  const modelId = resolveModelId(store.get(MODEL_COOKIE)?.value);
  return (
    <Chat
      id={crypto.randomUUID()}
      initialArtifacts={[]}
      initialMessages={[]}
      initialModelId={modelId}
    />
  );
}
