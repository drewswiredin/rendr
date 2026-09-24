import "server-only";

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  Codex,
  type CodexOptions,
  type ThreadEvent,
  type ThreadOptions,
} from "@openai/codex-sdk";
import type { ToolSet, UIMessage, UIMessageChunk } from "ai";
import type { Effort } from "@/lib/ai/models";
import type { TurnTokens } from "@/lib/ai/usage";
import { loadMcpConfig } from "@/lib/mcp/config";
import {
  bridgeUrl,
  openToolBridge,
  SERVER_NAME,
  stableKey,
} from "./tool-bridge";

// The ChatGPT-subscription backend: rendr's agent loop run by the Codex CLI
// (the `codex` binary that ships with @openai/codex-sdk) under the owner's
// ChatGPT login, so usage draws from that plan instead of an API key. Same
// contract as lib/ai/claude/stream — the CLI's JSONL events are translated
// into the UI message chunks the OpenRouter path produces, so everything
// downstream is shared.
//
// Two differences from the Claude path are structural: the presentation tools
// reach Codex over HTTP MCP (lib/ai/codex/tool-bridge) rather than in-process,
// and Codex has no system-prompt parameter — the prompt rides in the first
// turn of a thread, and later turns resume that thread.

// Threads are keyed by cwd; a fixed directory keeps them resumable, and
// read-only sandboxing means nothing is written there anyway.
const THREADS_CWD = path.join(process.cwd(), "data", "codex-threads");
// Nobody is at the terminal to approve a tool call, and with the approval
// policy set to `never` an unapproved MCP call is simply refused — so the
// servers rendr configures are pre-approved. Codex accepts `auto`, `prompt`,
// `writes` or `approve` here.
const APPROVE_TOOLS = "approve";
const IMAGES_DIR = path.join(THREADS_CWD, "images");

// Turning the skills off (see `skills` in the config below) stops Codex from
// advertising them, but the image generator behind the imagegen skill is a
// tool of the CLI's own, reachable whether or not the skill is described. It
// writes a PNG to $CODEX_HOME that only this backend can produce and nothing
// downstream can render, so the prompt closes the gap.
const BACKEND_CONSTRAINTS = `<backend_constraints>
Do not generate raster images: rendr has no channel that can show one, so the user sees nothing. Show what you mean with rendr's own forms — a diagram, a table, a piece — or with real images found through the research tools.
</backend_constraints>`;

export type CodexStreamParams = {
  // Omitted: whatever model the Codex CLI defaults to.
  model?: string;
  // Reasoning effort; omitted leaves the model's own default.
  effort?: Effort;
  systemPrompt: string;
  messages: UIMessage[];
  // AI SDK tools, executed in-process behind the MCP bridge.
  tools: ToolSet;
  threadId: string | null;
  // Reported by interactive pieces on the stage for this turn.
  pieceContext?: string;
  onThread: (threadId: string) => Promise<void> | void;
  // Tokens this turn spent, from turn.completed. Codex reports no cost —
  // the plan is flat — so rendr prices these itself.
  onUsage?: (tokens: TurnTokens) => void;
  abortSignal?: AbortSignal;
};

// MCP tools are reported by Codex as server + tool; the UI knows them as
// `<tool>` (presentation tools) or `<server>_<tool>` (research servers,
// matching lib/mcp/registry's naming).
export function uiToolName(server: string, tool: string): string {
  return server === SERVER_NAME
    ? tool
    : `${server}_${tool}`.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 128);
}

// Research servers from rendr.mcp.json, as Codex config entries.
function researchServerConfig(): Record<string, unknown> {
  const servers: Record<string, unknown> = {};
  for (const c of loadMcpConfig()) {
    servers[c.name] = {
      ...(c.kind === "stdio"
        ? { command: c.command, args: c.args ?? [], env: c.env }
        : { url: c.url, http_headers: c.headers }),
      default_tools_approval_mode: APPROVE_TOOLS,
    };
  }
  return servers;
}

// One line per research server for the system prompt. Codex names an MCP
// tool after its server, so the shape differs from the Claude path's
// `mcp__<server>__*`.
export function researchServerLines(): string[] {
  return loadMcpConfig().map(
    (c) =>
      `- ${c.name}${c.description ? ` — ${c.description}` : ""}: tools from the "${c.name}" MCP server`,
  );
}

function textOf(message: UIMessage): string {
  return message.parts
    .filter((p) => p.type === "text")
    .map((p) => p.text)
    .join("\n");
}

const IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

type CodexInput = Array<
  { type: "text"; text: string } | { type: "local_image"; path: string }
>;

// The turn's input: the system prompt and the conversation so far when the
// thread is new, the piece state, then the message and its files. Images are
// handed to the CLI as files; anything else is inlined as text.
function buildInput(
  params: CodexStreamParams,
  { fresh }: { fresh: boolean },
): CodexInput {
  const { messages, systemPrompt, pieceContext } = params;
  const last = messages[messages.length - 1];
  const input: CodexInput = [];
  const preamble: string[] = [];

  if (fresh) {
    preamble.push(`<instructions>\n${systemPrompt}\n</instructions>`);
    preamble.push(BACKEND_CONSTRAINTS);
    if (messages.length > 1) {
      const transcript = messages
        .slice(0, -1)
        .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${textOf(m)}`)
        .join("\n\n");
      preamble.push(
        `<conversation_so_far>\n${transcript}\n</conversation_so_far>`,
      );
    }
  }
  if (pieceContext) {
    preamble.push(
      `<stage_state>\nCurrent state of interactive pieces on the stage (reported by the pieces themselves; use it when the user refers to what they did):\n${pieceContext}\n</stage_state>`,
    );
  }

  for (const part of last.parts) {
    if (part.type !== "file") {
      continue;
    }
    const m = /^data:([^;]+);base64,([\s\S]+)$/.exec(part.url);
    if (!m) {
      input.push({
        type: "text",
        text: `[attachment: ${part.filename ?? part.mediaType}]`,
      });
    } else if (IMAGE_TYPES.has(m[1])) {
      mkdirSync(IMAGES_DIR, { recursive: true });
      const file = path.join(
        IMAGES_DIR,
        `${crypto.randomUUID()}.${m[1].split("/")[1]}`,
      );
      writeFileSync(file, Buffer.from(m[2], "base64"));
      input.push({ type: "local_image", path: file });
    } else {
      input.push({
        type: "text",
        text: `[attachment ${part.filename ?? ""}]\n${Buffer.from(m[2], "base64").toString("utf8").slice(0, 100_000)}`,
      });
    }
  }

  const text = [...preamble, textOf(last)].filter(Boolean).join("\n\n");
  input.push({ type: "text", text: text || "(empty message)" });
  return input;
}

export function streamCodex(
  params: CodexStreamParams,
): ReadableStream<UIMessageChunk> {
  return new ReadableStream<UIMessageChunk>({
    async start(controller) {
      const emit = (chunk: UIMessageChunk) => controller.enqueue(chunk);
      try {
        emit({ type: "start" });
        let resume = params.threadId;
        let ok = await run(params, { resume, emit });
        if (!ok && resume) {
          // The thread file may be gone (cleared ~/.codex, other machine):
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

// One Codex turn. Returns false when a resume was rejected before any output
// was produced (so the caller can retry fresh).
async function run(
  params: CodexStreamParams,
  {
    resume,
    emit,
  }: { resume: string | null; emit: (c: UIMessageChunk) => void },
): Promise<boolean> {
  mkdirSync(THREADS_CWD, { recursive: true });
  const bridge = openToolBridge(params.tools);

  const options: CodexOptions = {
    config: {
      // Codex ships its own skills (imagegen, plugin management) and offers
      // them to the model alongside rendr's tools — a capability the other
      // two backends don't have and no presentation channel can render. The
      // agent here is rendr's tools and the research servers, nothing else.
      // (Compare the Claude path's `tools: []` / `settingSources: []`.)
      skills: { include_instructions: false, bundled: { enabled: false } },
      mcp_servers: {
        [SERVER_NAME]: {
          url: bridgeUrl(bridge.token),
          default_tools_approval_mode: APPROVE_TOOLS,
        },
        ...researchServerConfig(),
      },
    },
    env: {
      ...(process.env as Record<string, string>),
      // Bill the subscription, never a stray API key in the environment.
      OPENAI_API_KEY: "",
    },
  };
  const threadOptions: ThreadOptions = {
    model: params.model,
    modelReasoningEffort: params.effort,
    workingDirectory: THREADS_CWD,
    skipGitRepoCheck: true,
    // rendr's agent writes artifacts through the tools, never through the
    // filesystem or the shell.
    sandboxMode: "read-only",
    approvalPolicy: "never",
    networkAccessEnabled: false,
    webSearchEnabled: false,
  };

  const codex = new Codex(options);
  const thread = resume
    ? codex.resumeThread(resume, threadOptions)
    : codex.startThread(threadOptions);

  // Text and reasoning items stream as growing snapshots, not deltas; these
  // hold what has already been emitted per item id.
  const emitted = new Map<string, { id: string; text: string }>();
  const calls = new Map<string, { name: string; input: unknown }>();
  let produced = false;
  let stepOpen = false;

  const endStep = () => {
    if (stepOpen) {
      emit({ type: "finish-step" });
      stepOpen = false;
    }
  };

  try {
    const { events } = await thread.runStreamed(
      buildInput(params, { fresh: !resume }),
      { signal: params.abortSignal },
    );
    for await (const event of events) {
      const outcome = handle(event);
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
  } finally {
    bridge.close();
  }
  endStep();
  return true;

  function isResumeRejection(detail: string) {
    return (
      resume !== null &&
      !produced &&
      /thread|session|rollout|resume/i.test(detail)
    );
  }

  // Returns true/false to end the run, undefined to keep reading.
  function handle(event: ThreadEvent): boolean | undefined {
    switch (event.type) {
      case "thread.started": {
        if (event.thread_id !== resume) {
          void params.onThread(event.thread_id);
        }
        break;
      }
      case "turn.started": {
        endStep();
        emit({ type: "start-step" });
        stepOpen = true;
        break;
      }
      case "item.started":
      case "item.updated":
      case "item.completed": {
        const done = event.type === "item.completed";
        const item = event.item;
        switch (item.type) {
          case "agent_message":
            produced = true;
            flushText("text", item.id, item.text, done);
            break;
          case "reasoning":
            flushText("reasoning", item.id, item.text, done);
            break;
          case "mcp_tool_call":
            handleToolCall(item, done);
            break;
          case "error":
            if (done) {
              emit({ type: "error", errorText: item.message });
            }
            break;
          default:
            // command_execution, file_change, web_search, todo_list: the
            // agent has no shell or network here, and a todo list is not
            // part of the reply.
            break;
        }
        break;
      }
      case "turn.completed": {
        const u = event.usage;
        params.onUsage?.({
          // Cached input is reported alongside the input count, not inside
          // it; reasoning output is already part of output_tokens.
          inputTokens: u.input_tokens + u.cached_input_tokens,
          outputTokens: u.output_tokens,
          reasoningTokens: u.reasoning_output_tokens,
          cacheReadTokens: u.cached_input_tokens,
          cacheWriteTokens: u.cache_write_input_tokens,
        });
        endStep();
        return true;
      }
      case "turn.failed": {
        endStep();
        if (isResumeRejection(event.error.message)) {
          return false;
        }
        throw new Error(event.error.message);
      }
      case "error": {
        endStep();
        if (isResumeRejection(event.message)) {
          return false;
        }
        throw new Error(event.message);
      }
      default:
        break;
    }
    return undefined;
  }

  // Codex reports the whole text each time; emit only what is new.
  function flushText(
    kind: "text" | "reasoning",
    itemId: string,
    text: string,
    done: boolean,
  ) {
    let entry = emitted.get(itemId);
    if (!entry) {
      entry = { id: crypto.randomUUID(), text: "" };
      emitted.set(itemId, entry);
      emit(
        kind === "text"
          ? { type: "text-start", id: entry.id }
          : { type: "reasoning-start", id: entry.id },
      );
    }
    if (text.length > entry.text.length && text.startsWith(entry.text)) {
      const delta = text.slice(entry.text.length);
      entry.text = text;
      emit(
        kind === "text"
          ? { type: "text-delta", id: entry.id, delta }
          : { type: "reasoning-delta", id: entry.id, delta },
      );
    } else if (text !== entry.text) {
      // A rewrite rather than an append: send the difference as a fresh
      // chunk so nothing is lost.
      entry.text = text;
      emit(
        kind === "text"
          ? { type: "text-delta", id: entry.id, delta: text }
          : { type: "reasoning-delta", id: entry.id, delta: text },
      );
    }
    if (done) {
      emit(
        kind === "text"
          ? { type: "text-end", id: entry.id }
          : { type: "reasoning-end", id: entry.id },
      );
      emitted.delete(itemId);
    }
  }

  function handleToolCall(
    item: {
      id: string;
      server: string;
      tool: string;
      arguments: unknown;
      result?: { content: unknown };
      error?: { message: string };
      status: string;
    },
    done: boolean,
  ) {
    const name = uiToolName(item.server, item.tool);
    const input = normalizeArgs(item.arguments);
    if (!calls.has(item.id)) {
      produced = true;
      calls.set(item.id, { name, input });
      emit({ type: "tool-input-start", toolCallId: item.id, toolName: name });
      emit({
        type: "tool-input-available",
        toolCallId: item.id,
        toolName: name,
        input,
      });
    }
    if (!done) {
      return;
    }
    if (item.error || item.status === "failed") {
      emit({
        type: "tool-output-error",
        toolCallId: item.id,
        errorText: item.error?.message ?? "tool error",
      });
      return;
    }
    // The presentation tools ran in this process, so the UI gets the rich
    // output they stashed; a research server's result is passed through in
    // the shape lib/mcp/registry produces.
    const key = stableKey(item.tool, input);
    const stashed = bridge.stash.get(key);
    const output = stashed?.length
      ? stashed.shift()
      : { content: item.result?.content ?? [], isError: false };
    emit({ type: "tool-output-available", toolCallId: item.id, output });
  }
}

// Codex hands back whatever the model produced; tool arguments are usually an
// object but can arrive as a JSON string.
function normalizeArgs(args: unknown): unknown {
  if (typeof args !== "string") {
    return args ?? {};
  }
  try {
    return JSON.parse(args);
  } catch {
    return args;
  }
}
