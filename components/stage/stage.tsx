"use client";

import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CodeIcon,
  CopyIcon,
  EyeIcon,
  PanelRightCloseIcon,
  XIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { UIRender } from "@/components/chat/ui-render";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type {
  ArtifactSnapshot,
  ArtifactVersionSummary,
} from "@/lib/artifacts/kinds";
import { kindLabels } from "@/lib/artifacts/kinds";
import { cn } from "@/lib/utils";
import {
  type ArtifactDraft,
  EXPANDED_ID,
  useArtifacts,
} from "@/stores/artifacts";
import { ArtifactView } from "./artifact-view";

// The stage: a pane of tabs, one per artifact, with preview/source views and
// version history. Drafts (artifacts still streaming in) appear as tabs too.

export function Stage() {
  const {
    artifacts,
    order,
    drafts,
    activeId,
    expanded,
    setActive,
    setOpen,
    closeExpanded,
  } = useArtifacts();

  const draftList = useMemo(() => Object.values(drafts), [drafts]);
  const activeDraft =
    draftList.find(
      (d) => d.toolCallId === activeId || d.targetId === activeId,
    ) ?? null;
  const activeArtifact = activeId ? artifacts[activeId] : undefined;

  return (
    <aside className="flex h-full min-w-0 flex-col border-l bg-background">
      <header className="flex h-12 shrink-0 items-center gap-1 border-b px-2">
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {expanded && (
            <TabButton
              active={activeId === EXPANDED_ID}
              closable
              label={expanded.title}
              onClick={() => setActive(EXPANDED_ID)}
              onClose={closeExpanded}
            />
          )}
          {draftList
            .filter((d) => !d.targetId)
            .map((draft) => (
              <TabButton
                active={activeId === draft.toolCallId}
                key={draft.toolCallId}
                label={draft.title}
                onClick={() => setActive(draft.toolCallId)}
                streaming
              />
            ))}
          {order.map((id) => {
            const a = artifacts[id];
            return (
              <TabButton
                active={activeId === id}
                key={id}
                label={a.title}
                onClick={() => setActive(id)}
                streaming={draftList.some((d) => d.targetId === id)}
              />
            );
          })}
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              aria-label="Close stage"
              onClick={() => setOpen(false)}
              size="icon-sm"
              variant="ghost"
            >
              <PanelRightCloseIcon className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Close stage</TooltipContent>
        </Tooltip>
      </header>

      <div className="min-h-0 flex-1">
        {activeId === EXPANDED_ID && expanded ? (
          <div className="h-full overflow-auto px-6 py-5">
            <UIRender
              className="mx-auto max-w-3xl"
              messageId={expanded.id}
              spec={expanded.spec}
            />
          </div>
        ) : activeDraft ? (
          <DraftPanel draft={activeDraft} />
        ) : activeArtifact ? (
          <ArtifactPanel artifact={activeArtifact} key={activeArtifact.id} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-1 px-8 text-center text-muted-foreground text-sm">
            <span className="font-medium text-foreground">
              Nothing on the stage yet
            </span>
            <span>
              Things worth keeping — an interactive, a diagram, a document —
              land here and stay while you work.
            </span>
          </div>
        )}
      </div>
    </aside>
  );
}

function TabButton({
  label,
  active,
  streaming,
  closable,
  onClick,
  onClose,
}: {
  label: string;
  active: boolean;
  streaming?: boolean;
  closable?: boolean;
  onClick: () => void;
  onClose?: () => void;
}) {
  return (
    <div
      className={cn(
        "flex h-8 shrink-0 items-center rounded-md text-sm transition-colors",
        active
          ? "bg-secondary text-foreground"
          : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
      )}
    >
      <button
        className="flex h-full items-center gap-1.5 pl-3 pr-3"
        onClick={onClick}
        type="button"
      >
        {streaming && (
          <span className="size-1.5 animate-pulse rounded-full bg-primary" />
        )}
        <span className="max-w-48 truncate">{label}</span>
      </button>
      {closable && (
        <button
          aria-label={`Close ${label}`}
          className="-ml-2 mr-1 rounded p-0.5 hover:bg-background/60"
          onClick={onClose}
          type="button"
        >
          <XIcon className="size-3.5" />
        </button>
      )}
    </div>
  );
}

function DraftPanel({ draft }: { draft: ArtifactDraft }) {
  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1">
        <ArtifactView
          content={draft.content}
          kind={draft.kind}
          streaming
          title={draft.title}
        />
      </div>
      <footer className="flex h-10 shrink-0 items-center gap-2 border-t px-3 text-muted-foreground text-xs">
        <span className="size-1.5 animate-pulse rounded-full bg-primary" />
        {draft.targetId ? "Rewriting…" : "Writing…"} · {kindLabels[draft.kind]}
      </footer>
    </div>
  );
}

function ArtifactPanel({ artifact }: { artifact: ArtifactSnapshot }) {
  const upsert = useArtifacts((s) => s.upsert);
  const [view, setView] = useState<"preview" | "source">("preview");
  const [versions, setVersions] = useState<ArtifactVersionSummary[] | null>(
    null,
  );
  const [viewingVersion, setViewingVersion] = useState<number | null>(null);
  const [source, setSource] = useState(artifact.content);
  const [dirty, setDirty] = useState(false);
  const [copied, setCopied] = useState(false);

  // A new version from the agent (or our own save) resets the editor and
  // snaps back to the latest version.
  useEffect(() => {
    setSource(artifact.content);
    setDirty(false);
    setViewingVersion(null);
    setVersions(null);
  }, [artifact.content]);

  const isLatest =
    viewingVersion === null || viewingVersion === artifact.version;
  const shownContent = isLatest
    ? source
    : (versions?.find((v) => v.version === viewingVersion)?.content ?? source);

  const loadVersions = useCallback(async () => {
    if (versions) {
      return versions;
    }
    const res = await fetch(`/api/artifacts/${artifact.id}/versions`);
    if (!res.ok) {
      toast.error("Couldn't load version history");
      return null;
    }
    const json = (await res.json()) as { versions: ArtifactVersionSummary[] };
    setVersions(json.versions);
    return json.versions;
  }, [artifact.id, versions]);

  const step = useCallback(
    async (delta: number) => {
      const list = await loadVersions();
      if (!list) {
        return;
      }
      const current = viewingVersion ?? artifact.version;
      const next = Math.min(artifact.version, Math.max(1, current + delta));
      setViewingVersion(next === artifact.version ? null : next);
    },
    [artifact.version, loadVersions, viewingVersion],
  );

  const save = useCallback(async () => {
    if (!dirty) {
      return;
    }
    const res = await fetch(`/api/artifacts/${artifact.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: source }),
    });
    if (!res.ok) {
      toast.error("Couldn't save your edit");
      return;
    }
    const json = (await res.json()) as { artifact: ArtifactSnapshot };
    upsert(json.artifact, { activate: false });
  }, [artifact.id, dirty, source, upsert]);

  const copy = useCallback(async () => {
    await navigator.clipboard.writeText(shownContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [shownContent]);

  const restore = useCallback(async () => {
    if (isLatest) {
      return;
    }
    const res = await fetch(`/api/artifacts/${artifact.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: shownContent }),
    });
    if (!res.ok) {
      toast.error("Couldn't restore that version");
      return;
    }
    const json = (await res.json()) as { artifact: ArtifactSnapshot };
    upsert(json.artifact, { activate: false });
  }, [artifact.id, isLatest, shownContent, upsert]);

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1">
        {view === "source" ? (
          <textarea
            className="h-full w-full resize-none bg-transparent p-4 font-mono text-xs leading-relaxed outline-none"
            onBlur={save}
            onChange={(event) => {
              setSource(event.target.value);
              setDirty(true);
            }}
            readOnly={!isLatest}
            spellCheck={false}
            value={shownContent}
          />
        ) : (
          <ArtifactView
            artifactId={artifact.id}
            content={shownContent}
            kind={artifact.kind}
            title={artifact.title}
          />
        )}
      </div>

      <footer className="flex h-10 shrink-0 items-center gap-1 border-t px-2">
        <span className="px-1 text-muted-foreground text-xs">
          {kindLabels[artifact.kind]}
        </span>
        <div className="flex-1" />
        {!isLatest && (
          <Button onClick={restore} size="sm" variant="secondary">
            Restore this version
          </Button>
        )}
        <div className="flex items-center gap-0.5 text-muted-foreground text-xs">
          <Button
            aria-label="Previous version"
            disabled={(viewingVersion ?? artifact.version) <= 1}
            onClick={() => step(-1)}
            size="icon-sm"
            variant="ghost"
          >
            <ChevronLeftIcon className="size-4" />
          </Button>
          <span className="tabular-nums">
            v{viewingVersion ?? artifact.version} / {artifact.version}
          </span>
          <Button
            aria-label="Next version"
            disabled={isLatest}
            onClick={() => step(1)}
            size="icon-sm"
            variant="ghost"
          >
            <ChevronRightIcon className="size-4" />
          </Button>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              aria-label={view === "source" ? "Preview" : "View source"}
              onClick={() => setView(view === "source" ? "preview" : "source")}
              size="icon-sm"
              variant="ghost"
            >
              {view === "source" ? (
                <EyeIcon className="size-4" />
              ) : (
                <CodeIcon className="size-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {view === "source" ? "Preview" : "View / edit source"}
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              aria-label="Copy"
              onClick={copy}
              size="icon-sm"
              variant="ghost"
            >
              {copied ? (
                <CheckIcon className="size-4" />
              ) : (
                <CopyIcon className="size-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>Copy source</TooltipContent>
        </Tooltip>
      </footer>
    </div>
  );
}
