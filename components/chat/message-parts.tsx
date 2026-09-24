"use client";

import { SPEC_DATA_PART_TYPE } from "@json-render/core";
import { buildSpecFromParts } from "@json-render/react";
import type { ToolUIPart, UIMessage } from "ai";
import {
  isDynamicToolUIPart,
  isFileUIPart,
  isReasoningUIPart,
  isStaticToolUIPart,
  isTextUIPart,
} from "ai";
import { FileIcon } from "lucide-react";
import { useMemo } from "react";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import { ArtifactCard } from "./artifact-card";
import { ResearchTrail } from "./research-trail";
import { UIRender } from "./ui-render";
import { type ReplyUsage, UsageLine } from "./usage-line";

const ARTIFACT_TOOLS = new Set([
  "tool-createArtifact",
  "tool-editArtifact",
  "tool-rewriteArtifact",
  "tool-readArtifact",
  "tool-listArtifacts",
]);

type MessagePartsProps = {
  message: UIMessage;
  isStreaming: boolean;
};

// Renders one message's parts in order. Each presentation channel adds its
// own part renderer here as it is introduced.
export function MessageParts({ message, isStreaming }: MessagePartsProps) {
  // One inline UI spec per message, assembled from its data-spec parts and
  // rendered where the first of them sits.
  // buildSpecFromParts mutates the patch values it is handed (an array added
  // at /state/rows keeps receiving inserts on every rebuild), so a streaming
  // message would show its rows duplicated. Build from a fresh deep copy.
  const spec = useMemo(() => {
    const cloned = message.parts.map((p) =>
      p.type === SPEC_DATA_PART_TYPE ? structuredClone(p) : p,
    );
    return buildSpecFromParts(
      cloned as Parameters<typeof buildSpecFromParts>[0],
    );
  }, [message.parts]);
  const hasSpec = spec !== null;
  const firstSpecIndex = message.parts.findIndex(
    (p) => p.type === SPEC_DATA_PART_TYPE,
  );

  // Consecutive research (MCP) tool calls — ignoring step markers and the
  // reasoning between them — collapse into one trail, rendered at the first.
  const trailStart = new Map<number, ToolUIPart[]>();
  const inTrail = new Set<number>();
  for (let i = 0; i < message.parts.length; i++) {
    if (inTrail.has(i)) {
      continue;
    }
    const part = message.parts[i];
    if (!(isStaticToolUIPart(part) && !ARTIFACT_TOOLS.has(part.type))) {
      continue;
    }
    const run: ToolUIPart[] = [part];
    inTrail.add(i);
    let pending: number[] = [];
    for (let j = i + 1; j < message.parts.length; j++) {
      const next = message.parts[j];
      if (isStaticToolUIPart(next) && !ARTIFACT_TOOLS.has(next.type)) {
        run.push(next);
        inTrail.add(j);
        // The thinking between two lookups is part of the same act.
        for (const k of pending) {
          inTrail.add(k);
        }
        pending = [];
      } else if (next.type === "step-start" || isReasoningUIPart(next)) {
        pending.push(j);
      } else {
        break;
      }
    }
    trailStart.set(i, run);
  }

  return (
    <Message from={message.role}>
      <MessageContent>
        {message.parts.map((part, index) => {
          const key = `${message.id}-${index}`;
          const isLast = index === message.parts.length - 1;

          if (trailStart.has(index)) {
            return (
              <ResearchTrail key={key} parts={trailStart.get(index) ?? []} />
            );
          }
          if (inTrail.has(index)) {
            return null;
          }

          // What the reply cost, appended by the API once the backend
          // reported it (see app/api/chat/route.ts).
          if (part.type === "data-usage") {
            return (
              <UsageLine
                key={key}
                usage={(part as { data: ReplyUsage }).data}
              />
            );
          }

          if (part.type === SPEC_DATA_PART_TYPE) {
            if (index !== firstSpecIndex || !hasSpec) {
              return null;
            }
            return (
              <UIRender
                key={key}
                loading={isStreaming}
                messageId={message.id}
                spec={spec}
              />
            );
          }

          if (isFileUIPart(part)) {
            return part.mediaType.startsWith("image/") ? (
              // biome-ignore lint/performance/noImgElement: user upload, unknown dimensions
              <img
                alt={part.filename ?? "attachment"}
                className="max-h-80 max-w-full rounded-lg border object-contain"
                key={key}
                src={part.url}
              />
            ) : (
              <a
                className="inline-flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm hover:bg-accent"
                href={part.url}
                key={key}
                rel="noreferrer"
                target="_blank"
              >
                <FileIcon className="size-4 text-muted-foreground" />
                <span className="max-w-64 truncate">
                  {part.filename ?? "attachment"}
                </span>
              </a>
            );
          }

          if (isTextUIPart(part)) {
            return (
              <MessageResponse
                className="[&>p]:max-w-[75ch] [&>ul]:max-w-[75ch] [&>ol]:max-w-[75ch] [&>blockquote]:max-w-[75ch] [&>h1]:max-w-[75ch] [&>h2]:max-w-[75ch] [&>h3]:max-w-[75ch]"
                codeBlockMaxHeight="none"
                isAnimating={isStreaming && isLast}
                key={key}
                tableMaxHeight="none"
              >
                {part.text}
              </MessageResponse>
            );
          }

          if (isReasoningUIPart(part)) {
            return (
              <Reasoning isStreaming={isStreaming && isLast} key={key}>
                <ReasoningTrigger />
                <ReasoningContent>{part.text}</ReasoningContent>
              </Reasoning>
            );
          }

          if (isStaticToolUIPart(part) && ARTIFACT_TOOLS.has(part.type)) {
            return <ArtifactCard key={key} part={part} />;
          }

          if (isStaticToolUIPart(part) || isDynamicToolUIPart(part)) {
            return (
              <Tool key={key}>
                {isDynamicToolUIPart(part) ? (
                  <ToolHeader
                    state={part.state}
                    toolName={part.toolName}
                    type={part.type}
                  />
                ) : (
                  <ToolHeader state={part.state} type={part.type} />
                )}
                <ToolContent>
                  <ToolInput input={part.input} />
                  <ToolOutput errorText={part.errorText} output={part.output} />
                </ToolContent>
              </Tool>
            );
          }

          return null;
        })}
      </MessageContent>
    </Message>
  );
}
