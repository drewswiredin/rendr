"use client";

import { LayersIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// The collapsed stage: a narrow rail that is always there. Shows how many
// artifacts are waiting and opens the pane on click.
export function StageRail({
  count,
  onOpen,
}: {
  count: number;
  onOpen: () => void;
}) {
  return (
    <aside className="flex h-full flex-col items-center border-l bg-background pt-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            aria-label={
              count > 0 ? `Open stage (${count})` : "Open stage (empty)"
            }
            className="relative"
            onClick={onOpen}
            size="icon-sm"
            variant="ghost"
          >
            <LayersIcon className="size-4" />
            {count > 0 && (
              <span className="-top-0.5 -right-0.5 absolute flex size-4 items-center justify-center rounded-full bg-primary font-medium text-[10px] text-primary-foreground tabular-nums">
                {count}
              </span>
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">
          {count > 0 ? `Stage · ${count}` : "Stage · nothing yet"}
        </TooltipContent>
      </Tooltip>
    </aside>
  );
}
