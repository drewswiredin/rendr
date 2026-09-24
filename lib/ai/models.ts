// Three backends: `claude` runs the Claude Agent SDK on the owner's Claude
// subscription login and `codex` runs the Codex CLI on the owner's ChatGPT
// login (no API key either way; usage draws from the plan's limits);
// `openrouter` is pay-per-token via OpenRouter and covers every other lab.
export type ModelBackend = "claude" | "codex" | "openrouter";

// Reasoning effort, one ladder across the three backends. Every model here
// takes it (Claude through the Agent SDK's `effort`, Codex through
// `modelReasoningEffort`, OpenRouter through `reasoning.effort`), but not
// every model takes every rung — `efforts` says which. "auto" sends nothing
// and leaves the backend's own default in place.
export const effortLevels = ["low", "medium", "high", "xhigh", "max"] as const;
export type Effort = (typeof effortLevels)[number];
export type EffortChoice = Effort | "auto";

export const effortLabels: Record<EffortChoice, string> = {
  auto: "Auto",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra high",
  max: "Max",
};

// OpenRouter's API tops out at xhigh; the subscription CLIs also take max.
const CLI_EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
const OPENROUTER_EFFORTS = ["low", "medium", "high", "xhigh"] as const;

export type ChatModel = {
  id: string;
  name: string;
  provider: string;
  description: string;
  backend: ModelBackend;
  // What the backend is asked for, when that differs from `id`. Omitted on
  // the codex backend means "whatever the CLI defaults to".
  backendModel?: string;
  // The OpenRouter id this model is priced by (see lib/ai/pricing). The two
  // subscription backends bill a plan rather than tokens, so their entries
  // point at the same model's pay-per-token listing: that is what the turn
  // would have cost.
  pricingId: string;
  // Effort rungs this model offers, beyond "auto".
  efforts: readonly Effort[];
};

export const DEFAULT_CHAT_MODEL = "claude-opus-5-5";

// Title generation: the subscription path uses Haiku through the Agent SDK;
// OpenRouter uses this id.
export const TITLE_MODEL = "anthropic/claude-haiku-4.5";
export const CLAUDE_TITLE_MODEL = "claude-haiku-4-5";

// Claude ids are Agent SDK / Claude Code model names; the rest are verified
// against https://openrouter.ai/api/v1/models
export const chatModels: ChatModel[] = [
  {
    id: "claude-opus-5-5",
    name: "Claude Opus 5.5",
    provider: "anthropic",
    description: "Anthropic's flagship model",
    backend: "claude",
    pricingId: "anthropic/claude-opus-5.5",
    efforts: CLI_EFFORTS,
  },
  {
    id: "claude-opus-5",
    name: "Claude Opus 5",
    provider: "anthropic",
    description: "Previous Opus release",
    backend: "claude",
    pricingId: "anthropic/claude-opus-5",
    efforts: CLI_EFFORTS,
  },
  {
    id: "claude-fable-5-1",
    name: "Claude Fable 5.1",
    provider: "anthropic",
    description: "Anthropic's most capable model",
    backend: "claude",
    pricingId: "anthropic/claude-fable-5.1",
    efforts: CLI_EFFORTS,
  },
  {
    id: "claude-sonnet-5",
    name: "Claude Sonnet 5",
    provider: "anthropic",
    description: "Fast and capable",
    backend: "claude",
    pricingId: "anthropic/claude-sonnet-5",
    efforts: CLI_EFFORTS,
  },
  {
    id: "anthropic/claude-opus-5.5",
    name: "Claude Opus 5.5",
    provider: "anthropic",
    description: "Anthropic's flagship model",
    backend: "openrouter",
    pricingId: "anthropic/claude-opus-5.5",
    efforts: OPENROUTER_EFFORTS,
  },
  {
    id: "anthropic/claude-opus-5",
    name: "Claude Opus 5",
    provider: "anthropic",
    description: "Previous Opus release",
    backend: "openrouter",
    pricingId: "anthropic/claude-opus-5",
    efforts: OPENROUTER_EFFORTS,
  },
  {
    id: "anthropic/claude-fable-5.1",
    name: "Claude Fable 5.1",
    provider: "anthropic",
    description: "Anthropic's most capable model",
    backend: "openrouter",
    pricingId: "anthropic/claude-fable-5.1",
    efforts: OPENROUTER_EFFORTS,
  },
  {
    id: "anthropic/claude-fable-5",
    name: "Claude Fable 5",
    provider: "anthropic",
    description: "Previous Fable release",
    backend: "openrouter",
    pricingId: "anthropic/claude-fable-5",
    efforts: OPENROUTER_EFFORTS,
  },
  {
    id: "codex-gpt-6-astra",
    name: "GPT-6 Astra",
    provider: "openai",
    description: "OpenAI's most capable model",
    backend: "codex",
    backendModel: "gpt-6-astra",
    pricingId: "openai/gpt-6-astra",
    efforts: CLI_EFFORTS,
  },
  {
    id: "codex-gpt-5.6-sol",
    name: "GPT-5.6 Sol",
    provider: "openai",
    description: "Frontier agentic model",
    backend: "codex",
    backendModel: "gpt-5.6-sol",
    pricingId: "openai/gpt-5.6-sol",
    efforts: CLI_EFFORTS,
  },
  {
    id: "codex-gpt-5.6-terra",
    name: "GPT-5.6 Terra",
    provider: "openai",
    description: "Balanced, for everyday work",
    backend: "codex",
    backendModel: "gpt-5.6-terra",
    pricingId: "openai/gpt-5.6-terra",
    efforts: CLI_EFFORTS,
  },
  {
    id: "codex-gpt-5.6-luna",
    name: "GPT-5.6 Luna",
    provider: "openai",
    description: "Fast and affordable",
    backend: "codex",
    backendModel: "gpt-5.6-luna",
    pricingId: "openai/gpt-5.6-luna",
    efforts: CLI_EFFORTS,
  },
  {
    id: "deepseek/deepseek-v4-pro",
    name: "DeepSeek V4 Pro",
    provider: "deepseek",
    description: "DeepSeek's flagship model",
    backend: "openrouter",
    pricingId: "deepseek/deepseek-v4-pro",
    efforts: OPENROUTER_EFFORTS,
  },
  {
    id: "moonshotai/kimi-k3",
    name: "Kimi K3",
    provider: "moonshotai",
    description: "Moonshot AI's flagship model",
    backend: "openrouter",
    pricingId: "moonshotai/kimi-k3",
    efforts: OPENROUTER_EFFORTS,
  },
  {
    id: "openai/gpt-5.6-sol",
    name: "GPT-5.6 Sol",
    provider: "openai",
    description: "OpenAI's flagship model",
    backend: "openrouter",
    pricingId: "openai/gpt-5.6-sol",
    efforts: OPENROUTER_EFFORTS,
  },
  {
    id: "x-ai/grok-4.5",
    name: "Grok 4.5",
    provider: "x-ai",
    description: "xAI's flagship model",
    backend: "openrouter",
    pricingId: "x-ai/grok-4.5",
    efforts: OPENROUTER_EFFORTS,
  },
];

// Where a model's tokens come from. This is the one place the source is
// written down: the catalog above says only which backend a model runs on, so
// a description can't drift from the truth or be left off a new entry.
export const backendLabels: Record<ModelBackend, string> = {
  claude: "your Claude plan",
  codex: "your ChatGPT plan",
  openrouter: "OpenRouter",
};

// The same model is often offered twice — once on a subscription, once on
// OpenRouter — and the two differ in cost, effort ladder, and which tools the
// backend brings. A name shared by more than one entry therefore carries its
// source wherever it is shown on its own.
const sharedNames = new Set(
  chatModels
    .map((m) => m.name)
    .filter((name, i, all) => all.indexOf(name) !== i),
);

export function modelLabel(model: ChatModel): string {
  return sharedNames.has(model.name)
    ? `${model.name} · ${backendLabels[model.backend]}`
    : model.name;
}

// In a list, where the description is shown too, the source rides on that.
export function modelDescription(model: ChatModel): string {
  return `${model.description} · ${backendLabels[model.backend]}`;
}

// Two entries a person can't tell apart are a bug, not a display problem:
// whichever they pick, the one they meant is a coin flip. The catalog is
// static, so this fails at import — in dev, on the first request.
const labels = chatModels.map(modelLabel);
const ambiguous = labels.filter((label, i) => labels.indexOf(label) !== i);
if (ambiguous.length > 0) {
  throw new Error(
    `chatModels: ${[...new Set(ambiguous)].join(", ")} — same name and same backend, so the picker would show two identical entries. Give them distinct names.`,
  );
}

const ids = chatModels.map((m) => m.id);
const duplicateIds = ids.filter((id, i) => ids.indexOf(id) !== i);
if (duplicateIds.length > 0) {
  throw new Error(`chatModels: duplicate id ${[...new Set(duplicateIds)]}`);
}

export const providerLabels: Record<string, string> = {
  anthropic: "Anthropic",
  deepseek: "DeepSeek",
  moonshotai: "Moonshot AI",
  openai: "OpenAI",
  "x-ai": "xAI",
};

export const allowedModelIds = new Set(chatModels.map((m) => m.id));

export function resolveModelId(id: string | undefined | null): string {
  return id && allowedModelIds.has(id) ? id : DEFAULT_CHAT_MODEL;
}

export function getChatModel(id: string): ChatModel {
  return (
    chatModels.find((m) => m.id === id) ??
    (chatModels.find((m) => m.id === DEFAULT_CHAT_MODEL) as ChatModel)
  );
}

export const MODEL_COOKIE = "rendr-model";
export const EFFORT_COOKIE = "rendr-effort";

// The chosen rung, or "auto" when the model doesn't offer it.
export function resolveEffort(
  model: ChatModel,
  effort: string | undefined | null,
): EffortChoice {
  return effort && (model.efforts as readonly string[]).includes(effort)
    ? (effort as Effort)
    : "auto";
}
