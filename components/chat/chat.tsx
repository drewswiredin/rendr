"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type FileUIPart, type UIMessage } from "ai";
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
  PromptInputActionAddAttachments,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuTrigger,
  PromptInputBody,
  PromptInputFooter,
  PromptInputHeader,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import { ArtifactSync } from "@/components/stage/artifact-sync";
import { Stage } from "@/components/stage/stage";
import { Button } from "@/components/ui/button";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { MODEL_COOKIE } from "@/lib/ai/models";
import type { ArtifactSnapshot } from "@/lib/artifacts/kinds";
import { cn } from "@/lib/utils";
import { useArtifacts } from "@/stores/artifacts";
import { useHistory } from "@/stores/history";
import { ChatProvider } from "./chat-context";
import { ComposerAttachments } from "./composer-attachments";
import { HistorySidebar } from "./history-sidebar";
import { MessageParts } from "./message-parts";
import { ModelPicker } from "./model-picker";
import { uploadAttachments } from "./upload";

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
    (s) =>
      s.order.length > 0 ||
      Object.keys(s.drafts).length > 0 ||
      s.expanded !== null,
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
        prepareSendMessagesRequest: ({ id: chatId, messages }) => {
          const { pieceContext, artifacts } = useArtifacts.getState();
          const pieces = Object.entries(pieceContext).map(
            ([artifactId, text]) => ({
              artifactId,
              title: artifacts[artifactId]?.title ?? "piece",
              text,
            }),
          );
          return {
            body: { id: chatId, messages, modelId: modelIdRef.current, pieces },
          };
        },
      }),
    [],
  );

  const refreshHistory = useHistory((s) => s.refresh);
  const { messages, sendMessage, status, stop } = useChat({
    id,
    messages: initialMessages,
    transport,
    onError: (error) => {
      toast.error(error.message || "Something went wrong");
    },
    // Titles are generated after the first reply; pick them up.
    onFinish: () => {
      refreshHistory();
    },
  });

  const isBusy = status === "submitted" || status === "streaming";

  // Stable across renders so pieces and inline UI holding it don't re-mount.
  const messageCountRef = useRef(messages.length);
  messageCountRef.current = messages.length;
  const sendText = useCallback(
    (text: string) => {
      if (messageCountRef.current === 0 && window.location.pathname === "/") {
        window.history.replaceState({}, "", `/chat/${id}`);
      }
      sendMessage({ text });
    },
    [id, sendMessage],
  );
  const chatActions = useMemo(() => ({ sendText }), [sendText]);

  const handleSubmit = useCallback(
    async (message: PromptInputMessage) => {
      const text = message.text?.trim() ?? "";
      const hasFiles = (message.files?.length ?? 0) > 0;
      if (!(text || hasFiles)) {
        return;
      }
      if (isBusy) {
        stop();
        return;
      }
      // Attachments arrive as data URLs; store them and send short URLs so
      // the persisted message stays small.
      let files: FileUIPart[] = [];
      if (hasFiles) {
        try {
          files = await uploadAttachments(message.files ?? []);
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Upload failed");
          throw error; // keeps the composer's attachments so the user can retry
        }
      }
      // First message of a new chat: move to its URL without a reload.
      if (messages.length === 0 && window.location.pathname === "/") {
        window.history.replaceState({}, "", `/chat/${id}`);
      }
      sendMessage({ text: text || "(see attachment)", files });
      setText("");
    },
    [id, isBusy, messages.length, sendMessage, stop],
  );

  return (
    <ChatProvider value={chatActions}>
      <SidebarProvider className="h-dvh min-h-0">
        <HistorySidebar currentChatId={id} />
        <SidebarInset className="flex h-dvh min-h-0 flex-row overflow-hidden">
          <ArtifactSync messages={messages} />
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <SidebarTrigger className="absolute top-3 left-3 z-10" />
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
              <PromptInput
                accept="image/*,application/pdf,text/plain,text/markdown,text/csv,application/json"
                globalDrop
                maxFileSize={20 * 1024 * 1024}
                multiple
                onError={(error) =>
                  toast.error(
                    error.code === "max_file_size"
                      ? "Files must be under 20 MB"
                      : error.code === "accept"
                        ? "That file type isn't supported"
                        : error.message,
                  )
                }
                onSubmit={handleSubmit}
              >
                <PromptInputHeader>
                  <ComposerAttachments />
                </PromptInputHeader>
                <PromptInputBody>
                  <PromptInputTextarea
                    onChange={(event) => setText(event.target.value)}
                    placeholder="Ask anything…"
                    value={text}
                  />
                </PromptInputBody>
                <PromptInputFooter>
                  <PromptInputTools>
                    <PromptInputActionMenu>
                      <PromptInputActionMenuTrigger />
                      <PromptInputActionMenuContent>
                        <PromptInputActionAddAttachments />
                      </PromptInputActionMenuContent>
                    </PromptInputActionMenu>
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
        </SidebarInset>
      </SidebarProvider>
    </ChatProvider>
  );
}
