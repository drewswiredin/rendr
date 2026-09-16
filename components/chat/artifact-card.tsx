"use client";

import type { ToolUIPart } from "ai";
import {
  AlertCircleIcon,
  FileTextIcon,
  LayoutTemplateIcon,
  WorkflowIcon,
} from "lucide-react";
import type { ArtifactKind, ArtifactSnapshot } from "@/lib/artifacts/kinds";
import { kindLabels } from "@/lib/artifacts/kinds";
import { cn } from "@/lib/utils";
import { useArtifacts } from "@/stores/artifacts";

const kindIcons: Record<ArtifactKind, typeof FileTextIcon> = {
  html: LayoutTemplateIcon,
  mermaid: WorkflowIcon,
  markdown: FileTextIcon,
};

const verbs: Record<string, string> = {
  createArtifact: "Created",
  editArtifact: "Edited",
  rewriteArtifact: "Rewrote",
  readArtifact: "Opened",
};

const streamingVerbs: Record<string, string> = {
  createArtifact: "Creating",
  editArtifact: "Editing",
  rewriteArtifact: "Rewriting",
  readArtifact: "Opening",
};

type Output =
  | { ok: true; artifact: ArtifactSnapshot }
  | { ok: false; error: string };

// A compact card in the message stream for each artifact tool call. Clicking
// it brings that artifact to the front of the stage.
export function ArtifactCard({ part }: { part: ToolUIPart }) {
  const { artifacts, setActive, busy } = useArtifacts();
  const toolName = part.type.slice("tool-".length);

  if (toolName === "listArtifacts") {
    return null;
  }

  const input = (part.input ?? {}) as Partial<{
    id: string;
    title: string;
    kind: ArtifactKind;
  }>;
  const output = part.output as Output | undefined;
  const done = part.state === "output-available" && output?.ok;
  // Input still streaming after the reply ended means the model was cut off
  // (output limit, abort, or provider error) before the call completed.
  const cutOff =
    !busy &&
    (part.state === "input-streaming" || part.state === "input-available");
  const failed =
    part.state === "output-error" ||
    (part.state === "output-available" && output && !output.ok) ||
    cutOff;

  const snapshot = done
    ? output.artifact
    : input.id
      ? artifacts[input.id]
      : undefined;
  const title = snapshot?.title ?? input.title ?? "Artifact";
  const kind = snapshot?.kind ?? input.kind;
  const Icon = kind ? kindIcons[kind] : FileTextIcon;
  const id = snapshot?.id ?? input.id;

  const label = cutOff
    ? `Cut off while ${streamingVerbs[toolName]?.toLowerCase() ?? "writing"} "${title}"`
    : failed
      ? `Couldn't ${toolName.replace("Artifact", "").toLowerCase()} "${title}"`
      : `${done ? verbs[toolName] : streamingVerbs[toolName]} "${title}"`;

  return (
    <button
      className={cn(
        "not-prose my-2 flex w-full max-w-md items-center gap-3 rounded-lg border bg-card px-3 py-2 text-left text-sm transition-colors",
        id ? "hover:bg-accent" : "cursor-default",
        failed && "border-destructive/40",
      )}
      disabled={!id}
      onClick={() => id && setActive(id)}
      type="button"
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-secondary">
        {failed ? (
          <AlertCircleIcon className="size-4 text-destructive" />
        ) : (
          <Icon className="size-4" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{label}</span>
        <span className="block text-muted-foreground text-xs">
          {cutOff
            ? "The reply ended before this was complete — ask to try again"
            : failed && output && !output.ok
              ? output.error
              : kind
                ? kindLabels[kind]
                : "…"}
          {done && snapshot && snapshot.versionCount > 1
            ? ` · v${snapshot.version}`
            : ""}
        </span>
      </span>
      {!(done || failed) && (
        <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-primary" />
      )}
    </button>
  );
}
