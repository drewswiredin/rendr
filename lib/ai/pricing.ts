import "server-only";

// Token prices come from OpenRouter's public model list — the same catalogue
// the model ids are checked against — so nothing here has to be maintained by
// hand and a price change shows up on the next refresh. Prices are USD per
// token, as strings.
//
// Only the Codex backend needs this: OpenRouter reports what it charged and
// the Claude Agent SDK reports its own costUSD, and a reported number always
// beats an estimate. See lib/ai/usage.

const MODELS_URL = "https://openrouter.ai/api/v1/models";
const TTL_MS = 6 * 60 * 60 * 1000;

export type TokenPrices = {
  prompt: number;
  completion: number;
  cacheRead: number;
  cacheWrite: number;
};

type Cache = { at: number; prices: Map<string, TokenPrices> };
const g = globalThis as typeof globalThis & { __rendrPrices?: Cache };

function parse(json: unknown): Map<string, TokenPrices> {
  const prices = new Map<string, TokenPrices>();
  const data = (json as { data?: unknown }).data;
  if (!Array.isArray(data)) {
    return prices;
  }
  for (const entry of data) {
    const model = entry as { id?: unknown; pricing?: Record<string, unknown> };
    if (typeof model.id !== "string" || !model.pricing) {
      continue;
    }
    const num = (v: unknown) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    };
    prices.set(model.id, {
      prompt: num(model.pricing.prompt),
      completion: num(model.pricing.completion),
      cacheRead: num(model.pricing.input_cache_read),
      cacheWrite: num(model.pricing.input_cache_write),
    });
  }
  return prices;
}

// The cached table, refreshed past its TTL. A failed refresh keeps the table
// it has: stale prices are better than none, and none is better than wrong.
async function table(): Promise<Map<string, TokenPrices>> {
  const cached = g.__rendrPrices;
  if (cached && Date.now() - cached.at < TTL_MS) {
    return cached.prices;
  }
  try {
    const response = await fetch(MODELS_URL, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const prices = parse(await response.json());
    if (prices.size > 0) {
      g.__rendrPrices = { at: Date.now(), prices };
      return prices;
    }
  } catch (error) {
    console.warn(
      "[pricing] could not refresh OpenRouter prices —",
      error instanceof Error ? error.message : error,
    );
  }
  return cached?.prices ?? new Map();
}

export type TokenCounts = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
};

// What these tokens would cost at list price, or null when the model isn't in
// the table. Cached and cache-write tokens are priced at their own rates and
// taken out of the plain input count; reasoning tokens are already inside
// outputTokens on every backend here, so they are not added again.
export async function estimateCost(
  pricingId: string,
  tokens: TokenCounts,
): Promise<number | null> {
  const prices = (await table()).get(pricingId);
  if (!prices) {
    return null;
  }
  const cacheRead = tokens.cacheReadTokens ?? 0;
  const cacheWrite = tokens.cacheWriteTokens ?? 0;
  const plainInput = Math.max(0, tokens.inputTokens - cacheRead - cacheWrite);
  return (
    plainInput * prices.prompt +
    cacheRead * prices.cacheRead +
    cacheWrite * prices.cacheWrite +
    tokens.outputTokens * prices.completion
  );
}
