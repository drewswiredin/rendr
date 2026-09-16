import "server-only";

import { type InferAgentUIMessage, stepCountIs, ToolLoopAgent } from "ai";
import { buildSystemPrompt } from "./prompts";
import { getLanguageModel } from "./providers";

// Tools are added per presentation channel in later steps; the agent is
// created per request so the user's model choice applies.
export function createAgent({ modelId }: { modelId: string }) {
  return new ToolLoopAgent({
    id: "rendr",
    model: getLanguageModel(modelId),
    instructions: buildSystemPrompt(),
    tools: {},
    stopWhen: stepCountIs(8),
  });
}

export type RendrAgent = ReturnType<typeof createAgent>;
export type RendrUIMessage = InferAgentUIMessage<RendrAgent>;
