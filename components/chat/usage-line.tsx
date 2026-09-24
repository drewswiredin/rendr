"use client";

import { backendLabels, type ChatModel, getChatModel } from "@/lib/ai/models";

// What one reply spent. On OpenRouter the dollars are what was charged; on
// the two subscription backends nothing is billed, so the figure is what
// those tokens would have cost at list price — said plainly rather than
// dressed up as a bill.

export type ReplyUsage = {
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  costUsd: number | null;
  billed: boolean;
};

export function formatTokens(n: number): string {
  if (n < 1000) {
    return `${n}`;
  }
  const k = n / 1000;
  return `${k < 10 ? k.toFixed(1) : Math.round(k)}k`;
}

// Fractions of a cent are noise, but rounding them to $0.00 reads as free.
export function formatUsd(cost: number): string {
  return cost > 0 && cost < 0.01 ? "<$0.01" : `$${cost.toFixed(2)}`;
}

// An estimate is marked with a tilde, except where the figure is already an
// upper bound — "~<$0.01" reads like a typo.
export function approxUsd(cost: number): string {
  const text = formatUsd(cost);
  return text.startsWith("<") ? text : `~${text}`;
}

function costLabel(usage: { costUsd: number | null; billed: boolean }): string {
  if (usage.costUsd === null) {
    return "no price listed";
  }
  return usage.billed
    ? formatUsd(usage.costUsd)
    : `${approxUsd(usage.costUsd)} not billed`;
}

export function UsageLine({ usage }: { usage: ReplyUsage }) {
  const model: ChatModel = getChatModel(usage.modelId);
  const total = usage.inputTokens + usage.outputTokens;
  const detail = [
    `${formatTokens(usage.inputTokens)} in`,
    `${formatTokens(usage.outputTokens)} out`,
    usage.reasoningTokens
      ? `${formatTokens(usage.reasoningTokens)} thinking`
      : null,
    usage.cacheReadTokens
      ? `${formatTokens(usage.cacheReadTokens)} cached`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      className="flex flex-wrap items-center gap-x-1.5 text-muted-foreground text-xs"
      title={detail}
    >
      <span>{model.name}</span>
      <span aria-hidden>·</span>
      <span>{backendLabels[model.backend]}</span>
      <span aria-hidden>·</span>
      <span>{formatTokens(total)} tokens</span>
      <span aria-hidden>·</span>
      <span>{costLabel(usage)}</span>
    </div>
  );
}
