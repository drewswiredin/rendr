"use client";

import { useCallback, useEffect, useState } from "react";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { backendLabels, getChatModel, modelLabel } from "@/lib/ai/models";
import { approxUsd, formatTokens, formatUsd } from "./usage-line";

// What the whole chat has spent, split the way the money actually works:
// what OpenRouter charged, and what the subscription turns would have cost.
// The breakdown is per model, so a chat that switched models — or ran the
// same model on two backends — shows each one on its own line.

type Row = {
  modelId: string;
  billed: boolean;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  costUsd: number | null;
  calls: number;
};

export function ChatCost({
  chatId,
  refreshKey,
}: {
  chatId: string;
  refreshKey: unknown;
}) {
  const [rows, setRows] = useState<Row[]>([]);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/chats/${chatId}/usage`);
      if (!res.ok) {
        return;
      }
      const json = (await res.json()) as { usage: Row[] };
      setRows(json.usage);
    } catch {
      // A missing total is not worth a toast.
    }
  }, [chatId]);

  useEffect(() => {
    // refreshKey flips when a turn ends — the moment the row the API just
    // wrote becomes readable.
    void refreshKey;
    load();
  }, [load, refreshKey]);

  if (rows.length === 0) {
    return null;
  }

  const billed = rows
    .filter((r) => r.billed)
    .reduce((sum, r) => sum + (r.costUsd ?? 0), 0);
  const notional = rows
    .filter((r) => !r.billed)
    .reduce((sum, r) => sum + (r.costUsd ?? 0), 0);

  const summary = [
    billed > 0 ? formatUsd(billed) : null,
    notional > 0 ? `${approxUsd(notional)} on plans` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <HoverCard>
      <HoverCardTrigger asChild>
        <button
          className="rounded-md px-2 py-1 text-muted-foreground text-xs hover:bg-secondary/60 hover:text-foreground"
          type="button"
        >
          {summary || "no cost yet"}
        </button>
      </HoverCardTrigger>
      <HoverCardContent align="end" className="w-80">
        <div className="space-y-2 text-xs">
          <div className="font-medium text-sm">This conversation</div>
          {rows.map((row) => {
            const model = getChatModel(row.modelId);
            return (
              <div
                className="flex items-baseline justify-between gap-3"
                key={`${row.modelId}-${row.billed}`}
              >
                <div className="min-w-0">
                  <div className="truncate">{modelLabel(model)}</div>
                  <div className="text-muted-foreground">
                    {row.calls} {row.calls === 1 ? "call" : "calls"} ·{" "}
                    {formatTokens(row.inputTokens + row.outputTokens)} tokens
                  </div>
                </div>
                <div className="shrink-0 tabular-nums">
                  {row.costUsd === null
                    ? "—"
                    : row.billed
                      ? formatUsd(row.costUsd)
                      : approxUsd(row.costUsd)}
                </div>
              </div>
            );
          })}
          {notional > 0 && (
            <p className="border-t pt-2 text-muted-foreground">
              Turns on {backendLabels.claude} or {backendLabels.codex} are
              covered by the plan. Their figure is what the same tokens would
              have cost at list price.
            </p>
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
