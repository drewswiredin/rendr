"use client";

import type { Spec } from "@json-render/core";
import {
  ActionProvider,
  type ComponentRenderer,
  Renderer,
  StateProvider,
  VisibilityProvider,
} from "@json-render/react";
import { Maximize2Icon, PinIcon } from "lucide-react";
import { useDeferredValue, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Fallback, registry, setReplySink } from "@/lib/ui/registry";
import { cn } from "@/lib/utils";
import { useArtifacts } from "@/stores/artifacts";
import { useChatActions } from "./chat-context";

const fallback: ComponentRenderer = ({ element }) => (
  <Fallback type={element.type} />
);

type UIRenderProps = {
  spec: Spec | null;
  loading?: boolean;
  messageId: string;
  className?: string;
};

// Renders one message's inline UI spec. Every piece gets two affordances:
// Expand (show it large on the stage, not persisted) and Pin (ask the agent
// to keep it as an artifact).
export function UIRender({
  spec,
  loading,
  messageId,
  className,
}: UIRenderProps) {
  const { sendText } = useChatActions();
  const expand = useArtifacts((s) => s.expand);

  useEffect(() => {
    setReplySink(sendText);
  }, [sendText]);

  const handlers = useMemo(
    () => ({
      reply: async (params: Record<string, unknown>) => {
        const text = typeof params.text === "string" ? params.text.trim() : "";
        if (text) {
          sendText(text);
        }
      },
    }),
    [sendText],
  );

  // While a spec streams in, every patch would otherwise re-render the whole
  // tree synchronously; deferring keeps typing and scrolling responsive.
  const deferredSpec = useDeferredValue(spec);
  const shownSpec = loading ? deferredSpec : spec;

  if (!shownSpec) {
    return null;
  }

  return (
    <div className={cn("group/ui relative my-2 w-full", className)}>
      <StateProvider initialState={shownSpec.state ?? {}}>
        <VisibilityProvider>
          <ActionProvider handlers={handlers}>
            <Renderer
              fallback={fallback}
              loading={loading}
              registry={registry}
              spec={shownSpec}
            />
          </ActionProvider>
        </VisibilityProvider>
      </StateProvider>

      {!loading && (
        <div className="absolute -top-2 right-0 flex gap-0.5 opacity-0 transition-opacity group-hover/ui:opacity-100 focus-within:opacity-100">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label="Expand on the stage"
                className="size-7 bg-background"
                onClick={() =>
                  expand({ id: messageId, title: "Expanded", spec: shownSpec })
                }
                size="icon-sm"
                variant="outline"
              >
                <Maximize2Icon className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Expand on the stage</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label="Pin as an artifact"
                className="size-7 bg-background"
                onClick={() =>
                  sendText(
                    "Pin that piece to the stage: recreate it as an artifact I can keep and edit (markdown for text/plans, html if it needs to stay interactive).",
                  )
                }
                size="icon-sm"
                variant="outline"
              >
                <PinIcon className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Pin as an artifact</TooltipContent>
          </Tooltip>
        </div>
      )}
    </div>
  );
}
