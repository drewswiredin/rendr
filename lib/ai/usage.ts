import "server-only";

import { getChatModel } from "./models";
import { estimateCost } from "./pricing";

// What one model call cost, in the one shape all three backends report into.
// `billed` separates money that actually moved (OpenRouter) from what a turn
// on a subscription would have cost at list price — the plans charge a flat
// fee, so their dollars are a comparison, never an invoice.

export type TurnTokens = {
  inputTokens: number;
  outputTokens: number;
  reasoningTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
};

export type TurnUsage = TurnTokens & {
  modelId: string;
  // Null when the model has no price listed and the backend reported none.
  costUsd: number | null;
  billed: boolean;
};

export type UsageReporter = (usage: TurnUsage) => void;

// A turn's usage, with the cost filled in the best way that backend allows:
// a reported charge if there is one, otherwise list price for those tokens.
export async function priceTurn({
  modelId,
  tokens,
  reportedCostUsd,
}: {
  modelId: string;
  tokens: TurnTokens;
  reportedCostUsd?: number | null;
}): Promise<TurnUsage> {
  const model = getChatModel(modelId);
  const billed = model.backend === "openrouter";
  const costUsd =
    typeof reportedCostUsd === "number" && Number.isFinite(reportedCostUsd)
      ? reportedCostUsd
      : await estimateCost(model.pricingId, tokens);
  return { ...tokens, modelId, costUsd, billed };
}
