import { cookies } from "next/headers";
import { Chat } from "@/components/chat/chat";
import {
  EFFORT_COOKIE,
  getChatModel,
  MODEL_COOKIE,
  resolveEffort,
  resolveModelId,
} from "@/lib/ai/models";

export default async function NewChatPage() {
  const store = await cookies();
  // A new chat starts from what was last used anywhere.
  const modelId = resolveModelId(store.get(MODEL_COOKIE)?.value);
  const effort = resolveEffort(
    getChatModel(modelId),
    store.get(EFFORT_COOKIE)?.value,
  );
  return (
    <Chat
      id={crypto.randomUUID()}
      initialArtifacts={[]}
      initialEffort={effort}
      initialMessages={[]}
      initialModelId={modelId}
    />
  );
}
