"use client";

import type { UIMessage } from "ai";
import {
  isDynamicToolUIPart,
  isReasoningUIPart,
  isStaticToolUIPart,
  isTextUIPart,
} from "ai";
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
  return (
    <Message from={message.role}>
      <MessageContent>
        {message.parts.map((part, index) => {
          const key = `${message.id}-${index}`;
          const isLast = index === message.parts.length - 1;

          if (isTextUIPart(part)) {
            return (
              <MessageResponse
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
