"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { PanelRightOpenIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import { ArtifactSync } from "@/components/stage/artifact-sync";
import { Stage } from "@/components/stage/stage";
import { Button } from "@/components/ui/button";
import { MODEL_COOKIE } from "@/lib/ai/models";
import type { ArtifactSnapshot } from "@/lib/artifacts/kinds";
import { cn } from "@/lib/utils";
import { useArtifacts } from "@/stores/artifacts";
import { MessageParts } from "./message-parts";
import { ModelPicker } from "./model-picker";

type ChatProps = {
  id: string;
  initialMessages: UIMessage[];
  initialArtifacts: ArtifactSnapshot[];
  initialModelId: string;
};

export function Chat({
  id,
  initialMessages,
  initialArtifacts,
  initialModelId,
}: ChatProps) {
  const stageOpen = useArtifacts((s) => s.open);
  const hasArtifacts = useArtifacts(
    (s) => s.order.length > 0 || Object.keys(s.drafts).length > 0,
  );
  const setStageOpen = useArtifacts((s) => s.setOpen);
  const resetArtifacts = useArtifacts((s) => s.reset);

  // Seed the stage from the server for this chat (and clear it when the chat changes).
  useEffect(() => {
    resetArtifacts(id, initialArtifacts);
  }, [id, initialArtifacts, resetArtifacts]);

  const [modelId, setModelIdState] = useState(initialModelId);
  const modelIdRef = useRef(modelId);
  const [text, setText] = useState("");

  const setModelId = useCallback((next: string) => {
    modelIdRef.current = next;
    setModelIdState(next);
    document.cookie = `${MODEL_COOKIE}=${encodeURIComponent(next)}; path=/; max-age=31536000; samesite=lax`;
  }, []);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        prepareSendMessagesRequest: ({ id: chatId, messages }) => ({
          body: { id: chatId, messages, modelId: modelIdRef.current },
        }),
      }),
    [],
  );

  const { messages, sendMessage, status, stop } = useChat({
    id,
    messages: initialMessages,
    transport,
    onError: (error) => {
      toast.error(error.message || "Something went wrong");
    },
  });

  const isBusy = status === "submitted" || status === "streaming";

  const handleSubmit = useCallback(
    (message: PromptInputMessage) => {
      if (!message.text?.trim()) {
        return;
      }
      if (isBusy) {
        stop();
        return;
      }
      // First message of a new chat: move to its URL without a reload.
      if (messages.length === 0 && window.location.pathname === "/") {
        window.history.replaceState({}, "", `/chat/${id}`);
      }
      sendMessage({ text: message.text });
      setText("");
    },
    [id, isBusy, messages.length, sendMessage, stop],
  );

  return (
    <div className="flex h-dvh min-h-0 flex-row">
      <ArtifactSync messages={messages} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {hasArtifacts && !stageOpen && (
          <Button
            aria-label="Open stage"
            className="absolute top-3 right-3 z-10"
            onClick={() => setStageOpen(true)}
            size="icon-sm"
            variant="outline"
          >
            <PanelRightOpenIcon className="size-4" />
          </Button>
        )}
        {messages.length === 0 ? (
          <div className="flex min-h-0 flex-1 items-center justify-center">
            <ConversationEmptyState
              description="Ask anything. The answer takes whatever shape fits it best."
              title="rendr"
            />
          </div>
        ) : (
          <Conversation className="min-h-0 flex-1">
            <ConversationContent className="mx-auto w-full max-w-3xl">
              {messages.map((message, index) => (
                <MessageParts
                  isStreaming={
                    status === "streaming" && index === messages.length - 1
                  }
                  key={message.id}
                  message={message}
                />
              ))}
            </ConversationContent>
            <ConversationScrollButton />
          </Conversation>
        )}

        <div className="mx-auto w-full max-w-3xl px-4 pb-4">
          <PromptInput onSubmit={handleSubmit}>
            <PromptInputBody>
              <PromptInputTextarea
                onChange={(event) => setText(event.target.value)}
                placeholder="Ask anything…"
                value={text}
              />
            </PromptInputBody>
            <PromptInputFooter>
              <PromptInputTools>
                <ModelPicker onChange={setModelId} value={modelId} />
              </PromptInputTools>
              <PromptInputSubmit
                disabled={!(text.trim() || isBusy)}
                status={status}
              />
            </PromptInputFooter>
          </PromptInput>
        </div>
      </div>
      <div
        className={cn(
          "h-full shrink-0 transition-[width] duration-300 ease-out",
          stageOpen && hasArtifacts ? "w-[58%]" : "w-0",
        )}
      >
        {stageOpen && hasArtifacts && <Stage />}
      </div>
    </div>
  );
}
