"use client";

import { create } from "zustand";
import type { ArtifactKind, ArtifactSnapshot } from "@/lib/artifacts/kinds";

// A draft is an artifact the agent is still streaming (its tool input hasn't
// completed). It shows on the stage immediately so the user watches it form.
export type ArtifactDraft = {
  toolCallId: string;
  targetId?: string; // set when rewriting an existing artifact
  title: string;
  kind: ArtifactKind;
  content: string;
};

type ArtifactsState = {
  chatId: string | null;
  artifacts: Record<string, ArtifactSnapshot>;
  order: string[]; // most recently updated first
  drafts: Record<string, ArtifactDraft>; // by toolCallId
  activeId: string | null; // artifact id or draft toolCallId
  open: boolean;
  hasAutoOpened: boolean;

  reset: (chatId: string, artifacts: ArtifactSnapshot[]) => void;
  upsert: (
    artifact: ArtifactSnapshot,
    options?: { activate?: boolean },
  ) => void;
  setDraft: (draft: ArtifactDraft) => void;
  clearDraft: (toolCallId: string) => void;
  setActive: (id: string | null) => void;
  setOpen: (open: boolean) => void;
};

function sortOrder(artifacts: Record<string, ArtifactSnapshot>) {
  return Object.values(artifacts)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((a) => a.id);
}

export const useArtifacts = create<ArtifactsState>((set) => ({
  chatId: null,
  artifacts: {},
  order: [],
  drafts: {},
  activeId: null,
  open: false,
  hasAutoOpened: false,

  reset: (chatId, list) => {
    const artifacts = Object.fromEntries(list.map((a) => [a.id, a]));
    const order = sortOrder(artifacts);
    set({
      chatId,
      artifacts,
      order,
      drafts: {},
      activeId: order[0] ?? null,
      // A chat that already has artifacts opens with the pane showing.
      open: order.length > 0,
      hasAutoOpened: order.length > 0,
    });
  },

  upsert: (artifact, options) =>
    set((state) => {
      const artifacts = { ...state.artifacts, [artifact.id]: artifact };
      const activate = options?.activate ?? true;
      return {
        artifacts,
        order: sortOrder(artifacts),
        activeId: activate ? artifact.id : state.activeId,
        // The pane opens itself the first time an artifact appears; after
        // that the user's open/closed choice sticks.
        open: state.hasAutoOpened ? state.open : true,
        hasAutoOpened: true,
      };
    }),

  setDraft: (draft) =>
    set((state) => ({
      drafts: { ...state.drafts, [draft.toolCallId]: draft },
      activeId: draft.targetId ?? draft.toolCallId,
      open: state.hasAutoOpened ? state.open : true,
      hasAutoOpened: true,
    })),

  clearDraft: (toolCallId) =>
    set((state) => {
      const { [toolCallId]: _removed, ...drafts } = state.drafts;
      return { drafts };
    }),

  setActive: (id) =>
    set((state) => ({ activeId: id, open: id ? true : state.open })),
  setOpen: (open) => set({ open }),
}));
