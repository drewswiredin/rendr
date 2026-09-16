import "server-only";

import { type InferAgentUIMessage, stepCountIs, ToolLoopAgent } from "ai";
import { buildSystemPrompt } from "./prompts";
import { getLanguageModel } from "./providers";
import { artifactTools } from "./tools/artifacts";

// The agent is created per request so the user's model choice and the
// conversation's workspace apply. Each presentation channel contributes its
// tools here and its prompt section in ./prompts.
export function createAgent({
  modelId,
  chatId,
  guestId,
}: {
  modelId: string;
  chatId: string;
  guestId: string;
}) {
  return new ToolLoopAgent({
    id: "rendr",
    model: getLanguageModel(modelId),
    instructions: buildSystemPrompt(),
    tools: {
      ...artifactTools({ chatId, guestId }),
    },
    stopWhen: stepCountIs(12),
  });
}

export type RendrAgent = ReturnType<typeof createAgent>;
export type RendrUIMessage = InferAgentUIMessage<RendrAgent>;
