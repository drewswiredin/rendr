"use client";

import type { UIMessage } from "ai";
import { isStaticToolUIPart } from "ai";
import { useEffect, useRef } from "react";
import {
  type ArtifactKind,
  type ArtifactSnapshot,
  artifactKinds,
} from "@/lib/artifacts/kinds";
import { useArtifacts } from "@/stores/artifacts";

// Mirrors artifact tool calls in the message stream into the artifacts store:
// a create/rewrite whose input is still streaming becomes a live draft on the
// stage; a completed call with a snapshot in its output upserts the artifact.
// Everything the stage shows therefore comes from the same message parts that
// are persisted, so a reload reconstructs the same state.

const WRITE_TOOLS = new Set(["createArtifact", "rewriteArtifact"]);
const SNAPSHOT_TOOLS = new Set([
  "createArtifact",
  "editArtifact",
  "rewriteArtifact",
  "readArtifact",
]);

function isKind(value: unknown): value is ArtifactKind {
  return (
    typeof value === "string" &&
    (artifactKinds as readonly string[]).includes(value)
  );
}

type SnapshotOutput = { ok: true; artifact: ArtifactSnapshot };

function snapshotOf(output: unknown): ArtifactSnapshot | null {
  if (
    output &&
    typeof output === "object" &&
    (output as SnapshotOutput).ok === true &&
    (output as SnapshotOutput).artifact
  ) {
    return (output as SnapshotOutput).artifact;
  }
  return null;
}

export function ArtifactSync({ messages }: { messages: UIMessage[] }) {
  const { upsert, setDraft, clearDraft } = useArtifacts();
  // Outputs already applied, so re-renders don't re-activate old artifacts.
  const appliedRef = useRef(new Set<string>());
  const draftsRef = useRef(new Set<string>());

  useEffect(() => {
    const last = messages.at(-1);
    if (!last || last.role !== "assistant") {
      return;
    }

    for (const part of last.parts) {
      if (!isStaticToolUIPart(part)) {
        continue;
      }
      const toolName = part.type.slice("tool-".length);
      const { toolCallId } = part;

      if (part.state === "input-streaming" && WRITE_TOOLS.has(toolName)) {
        const input = (part.input ?? {}) as Partial<{
          id: string;
          title: string;
          kind: string;
          content: string;
        }>;
        if (typeof input.content !== "string") {
          continue;
        }
        const existing = useArtifacts.getState();
        const target = input.id ? existing.artifacts[input.id] : undefined;
        const kind = isKind(input.kind) ? input.kind : target?.kind;
        if (!kind) {
          continue;
        }
        draftsRef.current.add(toolCallId);
        setDraft({
          toolCallId,
          targetId: target?.id,
          title: input.title ?? target?.title ?? "Untitled",
          kind,
          content: input.content,
        });
        continue;
      }

      if (part.state === "output-available" || part.state === "output-error") {
        if (draftsRef.current.delete(toolCallId)) {
          clearDraft(toolCallId);
        }
        if (appliedRef.current.has(toolCallId)) {
          continue;
        }
        if (part.state === "output-available" && SNAPSHOT_TOOLS.has(toolName)) {
          const snapshot = snapshotOf(part.output);
          if (snapshot) {
            appliedRef.current.add(toolCallId);
            upsert(snapshot);
          }
        }
      }
    }
  }, [messages, upsert, setDraft, clearDraft]);

  return null;
}
