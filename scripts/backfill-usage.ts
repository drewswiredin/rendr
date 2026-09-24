// Fills in the usage table for chats that ran before it existed.
//
// The two CLI backends keep their own transcripts, and those record real token
// counts per turn: Claude Code writes one JSONL per session under
// ~/.claude/projects/<cwd slug>/, Codex writes a rollout per thread under
// ~/.codex/sessions/. A chat carries the session or thread id, so its turns
// can be found and priced exactly as a live turn would be.
//
// OpenRouter chats cannot be recovered: nothing local recorded them, and the
// generation ids that would let the API answer were never stored. Those chats
// are left empty rather than filled with a guess — counting the tokens in the
// stored messages would miss the system prompt, tool schemas and cached
// prefix, which are most of the input on every turn.
//
// Safe to re-run: a chat that already has usage rows is skipped.

import { readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { createClient } from "@libsql/client";
import { chatModels } from "../lib/ai/models";

const url = process.env.DATABASE_URL ?? "file:./data/rendr.db";
const db = createClient({ url });

const CLAUDE_HOME =
  process.env.CLAUDE_CONFIG_DIR ?? path.join(homedir(), ".claude");
const CODEX_HOME = process.env.CODEX_HOME ?? path.join(homedir(), ".codex");

type Turn = {
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
};

// The transcript for one session or thread, found by name under a tree whose
// shape is the CLI's business (Claude keys by cwd slug, Codex by date).
function findTranscript(root: string, matches: (name: string) => boolean) {
  let entries: string[];
  try {
    entries = readdirSync(root, { recursive: true, encoding: "utf8" });
  } catch {
    return null;
  }
  const hit = entries.find((entry) => matches(path.basename(entry)));
  return hit ? path.join(root, hit) : null;
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function lines(file: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) {
      continue;
    }
    try {
      out.push(JSON.parse(line));
    } catch {
      // A transcript can end mid-write; the rest of it is still good.
    }
  }
  return out;
}

// Claude: one usage block per assistant message. The same message is written
// more than once as it streams, so the last write of each id wins.
function claudeTurns(sessionId: string, fallbackModel: string | null): Turn[] {
  const file = findTranscript(
    path.join(CLAUDE_HOME, "projects"),
    (name) => name === `${sessionId}.jsonl`,
  );
  if (!file) {
    return [];
  }
  const byId = new Map<string, Turn>();
  for (const entry of lines(file)) {
    const message = entry.message as
      | { id?: string; model?: string; usage?: Record<string, unknown> }
      | undefined;
    if (!message?.usage || !message.id) {
      continue;
    }
    const u = message.usage;
    const cacheRead = num(u.cache_read_input_tokens);
    const cacheWrite = num(u.cache_creation_input_tokens);
    const modelId = resolveModel(message.model, fallbackModel);
    if (!modelId) {
      continue;
    }
    byId.set(message.id, {
      modelId,
      inputTokens: num(u.input_tokens) + cacheRead + cacheWrite,
      outputTokens: num(u.output_tokens),
      reasoningTokens: 0,
      cacheReadTokens: cacheRead,
      cacheWriteTokens: cacheWrite,
    });
  }
  return [...byId.values()];
}

// Codex: a token_count event per turn, carrying that turn's usage and the
// running total. The model is in the turn context rather than the event.
function codexTurns(threadId: string, fallbackModel: string | null): Turn[] {
  const file = findTranscript(
    path.join(CODEX_HOME, "sessions"),
    (name) => name.startsWith("rollout-") && name.endsWith(`${threadId}.jsonl`),
  );
  if (!file) {
    return [];
  }
  const turns: Turn[] = [];
  let model: string | null = null;
  for (const entry of lines(file)) {
    const payload = entry.payload as Record<string, unknown> | undefined;
    if (!payload) {
      continue;
    }
    // A rollout line is tagged at the top level (session_meta, turn_context)
    // or inside its payload (the event stream); the model sits in the turn
    // context either way.
    const kind = entry.type ?? payload.type;
    if (kind === "turn_context" && typeof payload.model === "string") {
      model ??= payload.model;
    }
    if (payload.type !== "token_count") {
      continue;
    }
    const info = payload.info as Record<string, unknown> | undefined;
    const u = (info?.last_token_usage ?? info?.total_token_usage) as
      | Record<string, unknown>
      | undefined;
    const modelId = resolveModel(model, fallbackModel);
    if (!u || !modelId) {
      continue;
    }
    turns.push({
      modelId,
      inputTokens: num(u.input_tokens) + num(u.cached_input_tokens),
      outputTokens: num(u.output_tokens),
      reasoningTokens: num(u.reasoning_output_tokens),
      cacheReadTokens: num(u.cached_input_tokens),
      cacheWriteTokens: num(u.cache_write_input_tokens),
    });
  }
  return turns;
}

// A transcript names the model the backend was asked for; the catalog knows it
// either by id (Claude) or by backendModel (Codex).
function resolveModel(
  fromTranscript: string | null | undefined,
  fallback: string | null,
): string | null {
  if (fromTranscript) {
    const match = chatModels.find(
      (m) => m.id === fromTranscript || m.backendModel === fromTranscript,
    );
    if (match) {
      return match.id;
    }
  }
  return chatModels.some((m) => m.id === fallback) ? fallback : null;
}

async function prices(): Promise<Map<string, Record<string, number>>> {
  const response = await fetch("https://openrouter.ai/api/v1/models");
  const json = (await response.json()) as {
    data: Array<{ id: string; pricing: Record<string, string> }>;
  };
  const table = new Map<string, Record<string, number>>();
  for (const model of json.data) {
    table.set(model.id, {
      prompt: Number(model.pricing.prompt) || 0,
      completion: Number(model.pricing.completion) || 0,
      cacheRead: Number(model.pricing.input_cache_read) || 0,
      cacheWrite: Number(model.pricing.input_cache_write) || 0,
    });
  }
  return table;
}

async function main() {
  const table = await prices();
  const chats = await db.execute(
    "select id, model_id, claude_session_id, codex_thread_id from chat",
  );
  let filled = 0;
  let skipped = 0;
  const unrecoverable: string[] = [];

  for (const row of chats.rows) {
    const chatId = String(row.id);
    const fallback = row.model_id ? String(row.model_id) : null;
    const existing = await db.execute({
      sql: "select count(*) as n from usage where chat_id = ?",
      args: [chatId],
    });
    if (Number(existing.rows[0].n) > 0) {
      skipped++;
      continue;
    }

    const turns = row.claude_session_id
      ? claudeTurns(String(row.claude_session_id), fallback)
      : row.codex_thread_id
        ? codexTurns(String(row.codex_thread_id), fallback)
        : [];
    if (turns.length === 0) {
      unrecoverable.push(chatId);
      continue;
    }

    for (const turn of turns) {
      const model = chatModels.find((m) => m.id === turn.modelId);
      const price = model && table.get(model.pricingId);
      const plainInput = Math.max(
        0,
        turn.inputTokens - turn.cacheReadTokens - turn.cacheWriteTokens,
      );
      const cost = price
        ? plainInput * price.prompt +
          turn.cacheReadTokens * price.cacheRead +
          turn.cacheWriteTokens * price.cacheWrite +
          turn.outputTokens * price.completion
        : null;
      await db.execute({
        sql: `insert into usage (id, chat_id, message_id, model_id, input_tokens,
              output_tokens, reasoning_tokens, cache_read_tokens, cache_write_tokens,
              cost_usd, billed) values (?, ?, null, ?, ?, ?, ?, ?, ?, ?, 0)`,
        args: [
          crypto.randomUUID(),
          chatId,
          turn.modelId,
          turn.inputTokens,
          turn.outputTokens,
          turn.reasoningTokens,
          turn.cacheReadTokens,
          turn.cacheWriteTokens,
          cost,
        ],
      });
    }
    filled++;
    console.log(`  ${chatId}: ${turns.length} turn(s) — ${turns[0].modelId}`);
  }

  console.log(
    `\n${filled} chat(s) backfilled, ${skipped} already had usage, ` +
      `${unrecoverable.length} with no transcript (OpenRouter, or the ` +
      `transcript is gone).`,
  );
}

main().then(() => process.exit(0));
