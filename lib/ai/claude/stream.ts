import "server-only";

import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import {
  createSdkMcpServer,
  type McpServerConfig,
  type Options,
  query,
  type SDKMessage,
  type SDKUserMessage,
  tool as sdkTool,
} from "@anthropic-ai/claude-agent-sdk";
import type { Tool, ToolSet, UIMessage, UIMessageChunk } from "ai";
import { loadMcpConfig } from "@/lib/mcp/config";

// The subscription backend: rendr's agent loop run by the Claude Agent SDK
// (Claude Code as a library) under the owner's Claude login, so usage draws
// from the plan instead of an API key. The SDK's stream is translated into
// the same UI message chunks the AI SDK path produces, so everything
// downstream (json-render, persistence, part renderers) is shared.
//
// Prompt caching: the system prompt is static and recorded once per session
// (`snapshot`), per-request context (piece state, earlier turns) rides in the
// user turn, and each chat resumes its SDK session so the cached prefix is
// identical turn to turn. Claude Code places the cache breakpoints itself.

const CLIENT_APP = "rendr/0.1.0";
const SERVER_NAME = "rendr";
// Sessions are keyed by cwd; a fixed directory keeps them resumable.
const SESSIONS_CWD = path.join(process.cwd(), "data", "claude-sessions");
const MAX_TURNS = 12;

export type ClaudeStreamParams = {
  modelId: string;
  systemPrompt: string;
  messages: UIMessage[];
  // AI SDK tools executed in-process (the artifact tools).
  tools: ToolSet;
  sessionId: string | null;
  // Reported by interactive pieces on the stage for this turn.
  pieceContext?: string;
  onSession: (sessionId: string) => Promise<void> | void;
  abortSignal?: AbortSignal;
};

// SDK MCP tools are `mcp__<server>__<tool>`; the UI and the OpenRouter path
// know them as `<tool>` (in-process) or `<server>_<tool>` (research servers,
// matching lib/mcp/registry's naming).
export function uiToolName(name: string): string {
  const m = /^mcp__([^_]+(?:_[^_]+)*)__(.+)$/.exec(name);
  if (!m) {
    return name;
  }
  const [, server, tool] = m;
  return server === SERVER_NAME
    ? tool
    : `${server}_${tool}`.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 128);
}

function stableKey(name: string, input: unknown): string {
  const sort = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(sort)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.keys(v as object)
              .sort()
              .map((k) => [k, sort((v as Record<string, unknown>)[k])]),
          )
        : v;
  return `${name}:${JSON.stringify(sort(input))}`;
}

type ModelOutput =
  | { type: "text" | "error-text"; value: string }
  | { type: "json"; value: unknown }
  | {
      type: "content";
      value: Array<
        | { type: "text"; text: string }
        | {
            type: "file";
            mediaType: string;
            data: { type: "data"; data: string } | string;
          }
      >;
    };

// In-process tools: each AI SDK tool becomes an SDK MCP tool. The rich output
// (what the UI needs) is stashed by call so the tool_result can carry it;
// the model gets `toModelOutput`.
function buildToolServer(tools: ToolSet, stash: Map<string, unknown[]>) {
  const defs = [];
  for (const [name, t] of Object.entries(tools) as Array<[string, Tool]>) {
    const schema = t.inputSchema as { shape?: Record<string, never> };
    if (!schema?.shape) {
      console.warn(`[claude] ${name}: not a zod object schema — skipped`);
      continue;
    }
    const description =
      typeof t.description === "string" ? t.description : name;
    defs.push(
      sdkTool(name, description, schema.shape, async (args) => {
        const toolCallId = crypto.randomUUID();
        const output = await t.execute?.(args, {
          toolCallId,
          messages: [],
          context: undefined,
        });
        const key = stableKey(name, args);
        stash.set(key, [...(stash.get(key) ?? []), output]);
        const modelOutput = (
          t.toModelOutput
            ? await t.toModelOutput({ output, input: args, toolCallId })
            : { type: "json", value: output }
        ) as ModelOutput;
        return toCallToolResult(modelOutput);
      }),
    );
  }
  return createSdkMcpServer({ name: SERVER_NAME, tools: defs });
}

function toCallToolResult(out: ModelOutput) {
  switch (out.type) {
    case "text":
      return { content: [{ type: "text" as const, text: out.value }] };
    case "error-text":
      return {
        content: [{ type: "text" as const, text: out.value }],
        isError: true,
      };
    case "json":
      return {
        content: [{ type: "text" as const, text: JSON.stringify(out.value) }],
      };
    case "content":
      return {
        content: out.value.map((b) =>
          b.type === "text"
            ? { type: "text" as const, text: b.text }
            : {
                type: "image" as const,
                mimeType: b.mediaType,
                data: typeof b.data === "string" ? b.data : b.data.data,
              },
        ),
      };
  }
}

// Research servers from rendr.mcp.json, handed to the SDK as-is.
function researchServers(): Record<string, McpServerConfig> {
  const servers: Record<string, McpServerConfig> = {};
  for (const c of loadMcpConfig()) {
    servers[c.name] =
      c.kind === "stdio"
        ? { type: "stdio", command: c.command, args: c.args, env: c.env }
        : { type: "http", url: c.url, headers: c.headers };
  }
  return servers;
}

// One line per research server for the system prompt (tool names are the
// SDK's `mcp__<server>__<tool>`; the model discovers them from the tool list).
export function researchServerLines(): string[] {
  return loadMcpConfig().map(
    (c) =>
      `- ${c.name}${c.description ? ` — ${c.description}` : ""}: tools named mcp__${c.name}__*`,
  );
}

function textOf(message: UIMessage): string {
  return message.parts
    .filter((p) => p.type === "text")
    .map((p) => p.text)
    .join("\n");
}

type UserBlock = Exclude<SDKUserMessage["message"]["content"], string>[number];

const IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

// The user turn: prior turns as a transcript when there is no session to
// resume, the piece state for this turn, then the message and its files.
function buildUserMessage(
  messages: UIMessage[],
  { replay, pieceContext }: { replay: boolean; pieceContext?: string },
): SDKUserMessage {
  const last = messages[messages.length - 1];
  const blocks: UserBlock[] = [];
  const preamble: string[] = [];

  if (replay && messages.length > 1) {
    const transcript = messages
      .slice(0, -1)
      .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${textOf(m)}`)
      .join("\n\n");
    preamble.push(
      `<conversation_so_far>\n${transcript}\n</conversation_so_far>`,
    );
  }
  if (pieceContext) {
    preamble.push(
      `<stage_state>\nCurrent state of interactive pieces on the stage (reported by the pieces themselves; use it when the user refers to what they did):\n${pieceContext}\n</stage_state>`,
    );
  }

  for (const part of last.parts) {
    if (part.type === "file") {
      const m = /^data:([^;]+);base64,([\s\S]+)$/.exec(part.url);
      if (!m) {
        blocks.push({
          type: "text",
          text: `[attachment: ${part.filename ?? part.mediaType}]`,
        });
      } else if (IMAGE_TYPES.has(m[1])) {
        blocks.push({
          type: "image",
          source: {
            type: "base64",
            media_type: m[1] as
              | "image/jpeg"
              | "image/png"
              | "image/gif"
              | "image/webp",
            data: m[2],
          },
        });
      } else if (m[1] === "application/pdf") {
        blocks.push({
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: m[2] },
        });
      } else {
        blocks.push({
          type: "text",
          text: `[attachment ${part.filename ?? ""}]\n${Buffer.from(m[2], "base64").toString("utf8").slice(0, 100_000)}`,
        });
      }
    }
  }
  const text = [...preamble, textOf(last)].filter(Boolean).join("\n\n");
  blocks.push({ type: "text", text: text || "(empty message)" });

  return {
    type: "user",
    message: { role: "user", content: blocks },
    parent_tool_use_id: null,
  };
}

type ToolResultBlock = {
  type: "tool_result";
  tool_use_id: string;
  is_error?: boolean;
  content?:
    | string
    | Array<
        | { type: "text"; text: string }
        | {
            type: "image";
            source: { type: "base64"; media_type: string; data: string };
          }
      >;
};

// The UI output for a research tool: the MCP result shape lib/mcp/registry
// produces, so the same renderers apply.
function mcpOutputOf(block: ToolResultBlock) {
  const content =
    typeof block.content === "string"
      ? [{ type: "text", text: block.content }]
      : (block.content ?? []).map((b) =>
          b.type === "image"
            ? {
                type: "image",
                mimeType: b.source.media_type,
                data: b.source.data,
              }
            : b,
        );
  return { content, isError: block.is_error ?? false };
}

function errorTextOf(block: ToolResultBlock): string {
  if (typeof block.content === "string") {
    return block.content;
  }
  return (
    (block.content ?? [])
      .filter((b): b is { type: "text"; text: string } => b.type === "text")
      .map((b) => b.text)
      .join("\n") || "tool error"
  );
}

export function streamClaude(
  params: ClaudeStreamParams,
): ReadableStream<UIMessageChunk> {
  return new ReadableStream<UIMessageChunk>({
    async start(controller) {
      const emit = (chunk: UIMessageChunk) => controller.enqueue(chunk);
      try {
        emit({ type: "start" });
        let resume = params.sessionId;
        let ok = await run(params, { resume, emit });
        if (!ok && resume) {
          // The session file may be gone (cleared ~/.claude, other machine):
          // start over with the conversation replayed.
          resume = null;
          ok = await run(params, { resume, emit });
        }
        emit({ type: "finish" });
      } catch (error) {
        // A stop is not an error; what streamed so far is the reply.
        if (!params.abortSignal?.aborted) {
          emit({
            type: "error",
            errorText: error instanceof Error ? error.message : String(error),
          });
        }
        emit({ type: "finish" });
      } finally {
        controller.close();
      }
    },
  });
}

// One query() call. Returns false when a resume was rejected before any
// output was produced (so the caller can retry fresh).
async function run(
  params: ClaudeStreamParams,
  {
    resume,
    emit,
  }: { resume: string | null; emit: (c: UIMessageChunk) => void },
): Promise<boolean> {
  mkdirSync(SESSIONS_CWD, { recursive: true });
  const stash = new Map<string, unknown[]>();
  const abortController = new AbortController();
  params.abortSignal?.addEventListener("abort", () => abortController.abort());

  const options: Options = {
    model: params.modelId,
    cwd: SESSIONS_CWD,
    resume: resume ?? undefined,
    systemPrompt: {
      type: "custom",
      prompt: params.systemPrompt,
      snapshot: true,
    },
    // No Claude Code built-ins: the agent is the presentation tools plus the
    // research servers.
    tools: [],
    mcpServers: {
      [SERVER_NAME]: buildToolServer(params.tools, stash),
      ...researchServers(),
    },
    // Only these servers — never the owner's Claude Code MCP servers or
    // claude.ai connectors (Gmail, Drive, …).
    strictMcpConfig: true,
    permissionMode: "bypassPermissions",
    allowDangerouslySkipPermissions: true,
    // Neither the user's ~/.claude settings nor CLAUDE.md files belong in
    // this prompt; they'd also make it vary between machines.
    settingSources: [],
    includePartialMessages: true,
    thinking: { type: "adaptive", display: "summarized" },
    maxTurns: MAX_TURNS,
    abortController,
    env: {
      ...process.env,
      // Bill the subscription, never a stray API key in the environment.
      ANTHROPIC_API_KEY: undefined,
      CLAUDE_AGENT_SDK_CLIENT_APP: CLIENT_APP,
    },
  };

  const userMessage = buildUserMessage(params.messages, {
    replay: !resume,
    pieceContext: params.pieceContext,
  });
  async function* prompt() {
    yield userMessage;
  }

  // Per content block of the message being streamed.
  const blocks = new Map<
    number,
    { kind: "text" | "reasoning" | "tool"; id: string; name?: string }
  >();
  // tool_use ids → UI tool names, for matching tool_results.
  const calls = new Map<string, { name: string; input: unknown }>();
  // API message ids whose text arrived as deltas (the whole `assistant`
  // message follows the deltas and must not be emitted again).
  const streamedMessages = new Set<string>();
  let currentMessageId = "";
  let produced = false;
  let stepOpen = false;

  const endStep = () => {
    if (stepOpen) {
      emit({ type: "finish-step" });
      stepOpen = false;
    }
  };

  const q = query({ prompt: prompt(), options }) as AsyncIterable<SDKMessage>;
  const isResumeRejection = (detail: string) =>
    resume !== null && !produced && /session|resume|conversation/i.test(detail);

  try {
    for await (const msg of q) {
      if (process.env.RENDR_DEBUG_CLAUDE === "1") {
        appendFileSync("data/claude-events.log", `${JSON.stringify(msg)}\n`);
      }
      const outcome = handle(msg);
      if (outcome !== undefined) {
        return outcome;
      }
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (isResumeRejection(detail)) {
      return false;
    }
    throw error;
  }
  endStep();
  return true;

  // Returns true/false to end the run, undefined to keep reading.
  function handle(msg: SDKMessage): boolean | undefined {
    switch (msg.type) {
      case "system": {
        if (msg.subtype === "init" && msg.session_id !== resume) {
          void params.onSession(msg.session_id);
        }
        break;
      }
      case "stream_event": {
        if (msg.parent_tool_use_id) {
          break;
        }
        const ev = msg.event;
        switch (ev.type) {
          case "message_start":
            endStep();
            emit({ type: "start-step" });
            stepOpen = true;
            blocks.clear();
            currentMessageId = ev.message.id;
            break;
          case "content_block_start": {
            const b = ev.content_block;
            if (b.type === "text") {
              const id = crypto.randomUUID();
              blocks.set(ev.index, { kind: "text", id });
              emit({ type: "text-start", id });
            } else if (b.type === "thinking") {
              const id = crypto.randomUUID();
              blocks.set(ev.index, { kind: "reasoning", id });
              emit({ type: "reasoning-start", id });
            } else if (b.type === "tool_use") {
              const name = uiToolName(b.name);
              blocks.set(ev.index, { kind: "tool", id: b.id, name });
              emit({
                type: "tool-input-start",
                toolCallId: b.id,
                toolName: name,
              });
            }
            break;
          }
          case "content_block_delta": {
            const b = blocks.get(ev.index);
            if (!b) {
              break;
            }
            const d = ev.delta;
            if (b.kind === "text" && d.type === "text_delta") {
              produced = true;
              streamedMessages.add(currentMessageId);
              emit({ type: "text-delta", id: b.id, delta: d.text });
            } else if (b.kind === "reasoning" && d.type === "thinking_delta") {
              emit({ type: "reasoning-delta", id: b.id, delta: d.thinking });
            } else if (b.kind === "tool" && d.type === "input_json_delta") {
              emit({
                type: "tool-input-delta",
                toolCallId: b.id,
                inputTextDelta: d.partial_json,
              });
            }
            break;
          }
          case "content_block_stop": {
            const b = blocks.get(ev.index);
            if (b?.kind === "text") {
              emit({ type: "text-end", id: b.id });
            } else if (b?.kind === "reasoning") {
              emit({ type: "reasoning-end", id: b.id });
            }
            break;
          }
          default:
            break;
        }
        break;
      }
      case "assistant": {
        if (msg.parent_tool_use_id) {
          break;
        }
        if (msg.error) {
          throw new Error(describeAssistantError(msg));
        }
        for (const block of msg.message.content) {
          if (block.type === "tool_use") {
            produced = true;
            const name = uiToolName(block.name);
            calls.set(block.id, { name, input: block.input });
            emit({
              type: "tool-input-available",
              toolCallId: block.id,
              toolName: name,
              input: block.input,
            });
          } else if (
            block.type === "text" &&
            block.text &&
            !streamedMessages.has(msg.message.id)
          ) {
            // Partial events didn't arrive for this message: emit it whole.
            produced = true;
            const id = crypto.randomUUID();
            emit({ type: "text-start", id });
            emit({ type: "text-delta", id, delta: block.text });
            emit({ type: "text-end", id });
          }
        }
        if (msg.message.content.some((b) => b.type === "text")) {
          streamedMessages.add(msg.message.id);
        }
        break;
      }
      case "user": {
        if (msg.parent_tool_use_id || typeof msg.message.content === "string") {
          break;
        }
        for (const block of msg.message.content as ToolResultBlock[]) {
          if (block.type !== "tool_result") {
            continue;
          }
          const call = calls.get(block.tool_use_id);
          if (!call) {
            continue;
          }
          if (block.is_error) {
            emit({
              type: "tool-output-error",
              toolCallId: block.tool_use_id,
              errorText: errorTextOf(block),
            });
            continue;
          }
          const key = stableKey(call.name, call.input);
          const stashed = stash.get(key);
          const output = stashed?.length ? stashed.shift() : mcpOutputOf(block);
          emit({
            type: "tool-output-available",
            toolCallId: block.tool_use_id,
            output,
          });
        }
        break;
      }
      case "result": {
        endStep();
        if (msg.subtype === "success") {
          return true;
        }
        const detail =
          "errors" in msg && Array.isArray(msg.errors) && msg.errors.length
            ? msg.errors.join("; ")
            : msg.subtype;
        if (
          msg.subtype === "error_during_execution" &&
          isResumeRejection(detail)
        ) {
          return false;
        }
        if (msg.subtype === "error_max_turns") {
          // Same as the OpenRouter path's step cap: stop quietly.
          return true;
        }
        throw new Error(detail);
      }
      default:
        break;
    }
    return undefined;
  }
}

function describeAssistantError(msg: {
  error?: unknown;
  message: { content: Array<{ type: string; text?: string }> };
}): string {
  const text = msg.message.content
    .filter((b) => b.type === "text" && b.text)
    .map((b) => b.text)
    .join(" ");
  return text || `Claude returned an error (${String(msg.error)})`;
}
