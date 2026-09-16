"use client";

import { createContext, type ReactNode, useContext } from "react";

// Lets pieces rendered inside a message (inline UI, artifact cards) talk back
// to the conversation without prop drilling.
type ChatActions = {
  sendText: (text: string) => void;
};

const ChatContext = createContext<ChatActions | null>(null);

export function ChatProvider({
  value,
  children,
}: {
  value: ChatActions;
  children: ReactNode;
}) {
  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChatActions(): ChatActions {
  const ctx = useContext(ChatContext);
  if (!ctx) {
    throw new Error("useChatActions must be used inside <ChatProvider>");
  }
  return ctx;
}
