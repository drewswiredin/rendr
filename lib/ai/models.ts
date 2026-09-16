export type ChatModel = {
  id: string;
  name: string;
  provider: string;
  description: string;
};

export const DEFAULT_CHAT_MODEL = "anthropic/claude-opus-5";

export const TITLE_MODEL = "anthropic/claude-haiku-4.5";

// Ids verified against https://openrouter.ai/api/v1/models
export const chatModels: ChatModel[] = [
  {
    id: "anthropic/claude-opus-5",
    name: "Claude Opus 5",
    provider: "anthropic",
    description: "Anthropic's flagship model",
  },
  {
    id: "anthropic/claude-fable-5.1",
    name: "Claude Fable 5.1",
    provider: "anthropic",
    description: "Anthropic's most capable model",
  },
  {
    id: "anthropic/claude-fable-5",
    name: "Claude Fable 5",
    provider: "anthropic",
    description: "Previous Fable release",
  },
  {
    id: "deepseek/deepseek-v4-pro",
    name: "DeepSeek V4 Pro",
    provider: "deepseek",
    description: "DeepSeek's flagship model",
  },
  {
    id: "moonshotai/kimi-k3",
    name: "Kimi K3",
    provider: "moonshotai",
    description: "Moonshot AI's flagship model",
  },
  {
    id: "openai/gpt-5.6-sol",
    name: "GPT-5.6 Sol",
    provider: "openai",
    description: "OpenAI's flagship model",
  },
  {
    id: "x-ai/grok-4.5",
    name: "Grok 4.5",
    provider: "x-ai",
    description: "xAI's flagship model",
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

export const MODEL_COOKIE = "rendr-model";
