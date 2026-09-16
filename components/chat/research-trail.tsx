"use client";

import type { ToolUIPart } from "ai";
import { ChevronRightIcon, GlobeIcon, Loader2Icon } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

// A run of MCP tool calls (search, fetch, …) shown as one line — "Looked up
// 2 searches · 6 pages" — that expands to the queries and URLs. The full
// inputs/outputs stay in the message parts; this is just a calmer surface.

function label(part: ToolUIPart): { kind: string; detail: string } {
  const name = part.type.slice("tool-".length);
  const input = (part.input ?? {}) as Record<string, unknown>;
  const detail =
    typeof input.query === "string"
      ? input.query
      : typeof input.url === "string"
        ? input.url
        : (Object.values(input).find((v) => typeof v === "string") ?? "");
  const kind = /search/i.test(name)
    ? "search"
    : /fetch|extract|read|crawl/i.test(name)
      ? "page"
      : name;
  return { kind, detail: String(detail) };
}

export function ResearchTrail({ parts }: { parts: ToolUIPart[] }) {
  const [open, setOpen] = useState(false);
  const items = parts.map(label);
  const searches = items.filter((i) => i.kind === "search").length;
  const pages = items.filter((i) => i.kind === "page").length;
  const other = items.length - searches - pages;
  const running = parts.some(
    (p) => p.state === "input-streaming" || p.state === "input-available",
  );
  const failed = parts.filter((p) => p.state === "output-error").length;

  const summary = [
    searches > 0 && `${searches} search${searches === 1 ? "" : "es"}`,
    pages > 0 && `${pages} page${pages === 1 ? "" : "s"}`,
    other > 0 && `${other} lookup${other === 1 ? "" : "s"}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="not-prose my-2 text-sm">
      <button
        className="group flex items-center gap-2 text-muted-foreground hover:text-foreground"
        onClick={() => setOpen((o) => !o)}
        type="button"
      >
        {running ? (
          <Loader2Icon className="size-3.5 animate-spin" />
        ) : (
          <GlobeIcon className="size-3.5" />
        )}
        <span>
          {running ? "Looking up" : "Looked up"} {summary || "sources"}
          {failed > 0 ? ` · ${failed} failed` : ""}
        </span>
        <ChevronRightIcon
          className={cn("size-3.5 transition-transform", open && "rotate-90")}
        />
      </button>
      {open && (
        <ul className="mt-1.5 ml-1 flex flex-col gap-1 border-l pl-4 text-muted-foreground text-xs">
          {parts.map((p, i) => {
            const { kind, detail } = items[i];
            const isUrl = /^https?:\/\//.test(detail);
            return (
              <li className="flex min-w-0 gap-2" key={p.toolCallId}>
                <span className="shrink-0 tabular-nums">{kind}</span>
                {isUrl ? (
                  <a
                    className="truncate hover:text-foreground hover:underline"
                    href={detail}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    {detail}
                  </a>
                ) : (
                  <span className="truncate">{detail}</span>
                )}
                {p.state === "output-error" && (
                  <span className="shrink-0 text-destructive">failed</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
