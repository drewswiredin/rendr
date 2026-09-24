import "server-only";

import { type InferAgentUIMessage, stepCountIs, ToolLoopAgent } from "ai";
import { getMcpTools } from "@/lib/mcp/registry";
import type { Effort } from "./models";
import { buildSystemPrompt } from "./prompts";
import { getLanguageModel } from "./providers";
import { artifactTools } from "./tools/artifacts";

// The OpenRouter backend: an AI SDK agent created per request so the user's
// model choice and the conversation's workspace apply. Each presentation
// channel contributes its tools here and its prompt section in ./prompts.
// (Claude models on the owner's subscription run through ./claude instead.)
export async function createAgent({
  modelId,
  effort,
  chatId,
  guestId,
  pieceContext,
}: {
  modelId: string;
  effort?: Effort;
  chatId: string;
  guestId: string;
  pieceContext?: string;
}) {
  const mcp = await getMcpTools();
  let instructions = buildSystemPrompt({ mcpServers: mcp.servers });
  if (pieceContext) {
    instructions += `\n\n**Current state of interactive pieces on the stage** (reported by the pieces themselves; use it when the user refers to what they did):\n${pieceContext}`;
  }
  return new ToolLoopAgent({
    id: "rendr",
    model: getLanguageModel(modelId),
    instructions,
    tools: {
      ...artifactTools({ chatId, guestId }),
      ...mcp.tools,
    },
    stopWhen: stepCountIs(12),
    // Reasoning counts against the output budget on Anthropic models, so it
    // gets its own cap: a long artifact must never be cut off because the
    // model thought for a while first. 32k output leaves ~20k for content.
    maxOutputTokens: 32_000,
    providerOptions: {
      // A chosen effort replaces the budget: OpenRouter takes one or the
      // other, and the effort is the user's call.
      openrouter: {
        reasoning: effort ? { effort } : { max_tokens: 8_000 },
      },
    },
  });
}

export type RendrAgent = Awaited<ReturnType<typeof createAgent>>;
export type RendrUIMessage = InferAgentUIMessage<RendrAgent>;
