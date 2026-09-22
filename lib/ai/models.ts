// Two backends: `claude` runs the Claude Agent SDK on the owner's Claude
// subscription login (no API key; usage draws from the plan's limits);
// `openrouter` is pay-per-token via OpenRouter and covers every other lab.
export type ModelBackend = "claude" | "openrouter";

export type ChatModel = {
  id: string;
  name: string;
  provider: string;
  description: string;
  backend: ModelBackend;
};

export const DEFAULT_CHAT_MODEL = "claude-opus-5";

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
    description: "Anthropic's flagship model · your Claude plan",
    backend: "claude",
  },
  {
    id: "claude-opus-5",
    name: "Claude Opus 5",
    provider: "anthropic",
    description: "Previous Opus release · your Claude plan",
    backend: "claude",
  },
  {
    id: "claude-fable-5-1",
    name: "Claude Fable 5.1",
    provider: "anthropic",
    description: "Anthropic's most capable model · your Claude plan",
    backend: "claude",
  },
  {
    id: "claude-sonnet-5",
    name: "Claude Sonnet 5",
    provider: "anthropic",
    description: "Fast and capable · your Claude plan",
    backend: "claude",
  },
  {
    id: "anthropic/claude-opus-5.5",
    name: "Claude Opus 5.5",
    provider: "anthropic",
    description: "Anthropic's flagship model · OpenRouter",
    backend: "openrouter",
  },
  {
    id: "anthropic/claude-opus-5",
    name: "Claude Opus 5",
    provider: "anthropic",
    description: "Previous Opus release · OpenRouter",
    backend: "openrouter",
  },
  {
    id: "anthropic/claude-fable-5.1",
    name: "Claude Fable 5.1",
    provider: "anthropic",
    description: "Anthropic's most capable model · OpenRouter",
    backend: "openrouter",
  },
  {
    id: "anthropic/claude-fable-5",
    name: "Claude Fable 5",
    provider: "anthropic",
    description: "Previous Fable release · OpenRouter",
    backend: "openrouter",
  },
  {
    id: "deepseek/deepseek-v4-pro",
    name: "DeepSeek V4 Pro",
    provider: "deepseek",
    description: "DeepSeek's flagship model",
    backend: "openrouter",
  },
  {
    id: "moonshotai/kimi-k3",
    name: "Kimi K3",
    provider: "moonshotai",
    description: "Moonshot AI's flagship model",
    backend: "openrouter",
  },
  {
    id: "openai/gpt-5.6-sol",
    name: "GPT-5.6 Sol",
    provider: "openai",
    description: "OpenAI's flagship model",
    backend: "openrouter",
  },
  {
    id: "x-ai/grok-4.5",
    name: "Grok 4.5",
    provider: "x-ai",
    description: "xAI's flagship model",
    backend: "openrouter",
  },
];

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
