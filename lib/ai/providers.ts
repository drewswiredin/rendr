import "server-only";

import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { TITLE_MODEL } from "./models";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

export function getLanguageModel(modelId: string) {
  return openrouter.chat(modelId);
}

export function getTitleModel() {
  return openrouter.chat(TITLE_MODEL);
}
