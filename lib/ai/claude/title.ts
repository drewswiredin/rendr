import "server-only";

import { query } from "@anthropic-ai/claude-agent-sdk";
import { CLAUDE_TITLE_MODEL } from "../models";
import { titlePrompt } from "../prompts";

// A one-shot, tool-less, unpersisted query on the subscription for the
// chat title; the same Haiku the OpenRouter path uses.
export async function generateClaudeTitle(firstMessage: string) {
  const q = query({
    prompt: `First message:\n"""\n${firstMessage}\n"""\n\nTitle:`,
    options: {
      model: CLAUDE_TITLE_MODEL,
      systemPrompt: titlePrompt,
      tools: [],
      settingSources: [],
      persistSession: false,
      maxTurns: 1,
      thinking: { type: "disabled" },
      env: { ...process.env, ANTHROPIC_API_KEY: undefined },
    },
  });
  for await (const msg of q) {
    if (msg.type === "result" && msg.subtype === "success") {
      return msg.result;
    }
  }
  return "";
}
