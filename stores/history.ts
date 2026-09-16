"use client";

import { create } from "zustand";

export type ChatSummary = { id: string; title: string; createdAt: number };

type HistoryState = {
  chats: ChatSummary[];
  loaded: boolean;
  refresh: () => Promise<void>;
  remove: (id: string) => Promise<void>;
};

// The chat list in the sidebar. Refreshed when a reply finishes (titles are
// generated after the first message) and after deletions.
export const useHistory = create<HistoryState>((set) => ({
  chats: [],
  loaded: false,
  refresh: async () => {
    const res = await fetch("/api/chats");
    if (!res.ok) {
      return;
    }
    const json = (await res.json()) as { chats: ChatSummary[] };
    set({ chats: json.chats, loaded: true });
  },
  remove: async (id) => {
    await fetch(`/api/chats/${id}`, { method: "DELETE" });
    set((state) => ({ chats: state.chats.filter((c) => c.id !== id) }));
  },
}));
