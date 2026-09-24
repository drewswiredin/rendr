import "server-only";

import { mkdirSync } from "node:fs";
import path from "node:path";
import { Codex } from "@openai/codex-sdk";
import { titlePrompt } from "../prompts";

const THREADS_CWD = path.join(process.cwd(), "data", "codex-threads");

// A one-shot, tool-less turn on the ChatGPT subscription for the chat title.
// Codex has no system-prompt parameter, so the instructions ride in the turn.
export async function generateCodexTitle(firstMessage: string) {
  mkdirSync(THREADS_CWD, { recursive: true });
  const codex = new Codex({
    // Same as the chat path: none of Codex's own skills, which a title has no
    // use for and which are most of this turn's input.
    config: {
      skills: { include_instructions: false, bundled: { enabled: false } },
    },
    env: { ...(process.env as Record<string, string>), OPENAI_API_KEY: "" },
  });
  const thread = codex.startThread({
    workingDirectory: THREADS_CWD,
    skipGitRepoCheck: true,
    sandboxMode: "read-only",
    approvalPolicy: "never",
    networkAccessEnabled: false,
    webSearchEnabled: false,
    modelReasoningEffort: "low",
  });
  const turn = await thread.run(
    `${titlePrompt}\n\nFirst message:\n"""\n${firstMessage}\n"""\n\nTitle:`,
  );
  return turn.finalResponse;
}
