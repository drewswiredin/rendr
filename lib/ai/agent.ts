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
  pieceContext,
}: {
  modelId: string;
  chatId: string;
  guestId: string;
  pieceContext?: string;
}) {
  const instructions = pieceContext
    ? `${buildSystemPrompt()}\n\n**Current state of interactive pieces on the stage** (reported by the pieces themselves; use it when the user refers to what they did):\n${pieceContext}`
    : buildSystemPrompt();
  return new ToolLoopAgent({
    id: "rendr",
    model: getLanguageModel(modelId),
    instructions,
    tools: {
      ...artifactTools({ chatId, guestId }),
    },
    stopWhen: stepCountIs(12),
    // Plenty for a long artifact; keeps providers from reserving the model's
    // full output window per request.
    maxOutputTokens: 16_000,
  });
}

export type RendrAgent = ReturnType<typeof createAgent>;
export type RendrUIMessage = InferAgentUIMessage<RendrAgent>;
