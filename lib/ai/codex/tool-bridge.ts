import "server-only";

import type { Tool, ToolSet } from "ai";
import * as z from "zod";

// The Codex backend can't take in-process tools the way the Claude Agent SDK
// can (lib/ai/claude/stream's `createSdkMcpServer`): the `codex` CLI only
// reaches MCP servers it can spawn or fetch over HTTP. So a turn opens a
// bridge — a one-time token naming the tools for that turn — and Codex is
// pointed at /api/mcp/rendr/<token>, which calls straight back into the same
// process. One process, one map, same as lib/ai/live-streams.
//
// Executing in-process is what keeps the rich tool output: the artifact
// snapshot the UI needs is stashed here by call, and lib/ai/codex/stream
// pairs it with the mcp_tool_call item instead of re-reading the database.

type Bridge = {
  tools: ToolSet;
  // Rich outputs by call, in call order (the model only sees toModelOutput).
  stash: Map<string, unknown[]>;
  expires: number;
};

const TTL_MS = 30 * 60 * 1000;

const g = globalThis as typeof globalThis & {
  __rendrCodexBridges?: Map<string, Bridge>;
};
const bridges: Map<string, Bridge> = g.__rendrCodexBridges ?? new Map();
g.__rendrCodexBridges = bridges;

export const SERVER_NAME = "rendr";

// Same shape as the Claude path's key, so a tool called twice with identical
// arguments still pairs up in order.
export function stableKey(name: string, input: unknown): string {
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

export function openToolBridge(tools: ToolSet): {
  token: string;
  stash: Map<string, unknown[]>;
  close: () => void;
} {
  sweep();
  const token = crypto.randomUUID().replace(/-/g, "");
  const stash = new Map<string, unknown[]>();
  bridges.set(token, { tools, stash, expires: Date.now() + TTL_MS });
  return { token, stash, close: () => bridges.delete(token) };
}

function sweep() {
  const now = Date.now();
  for (const [token, bridge] of bridges) {
    if (bridge.expires < now) {
      bridges.delete(token);
    }
  }
}

// The MCP server URL a Codex thread is configured with. The CLI runs beside
// the app, so it reaches it on the loopback address.
export function bridgeUrl(token: string): string {
  const base =
    process.env.RENDR_SELF_URL ??
    `http://127.0.0.1:${process.env.PORT ?? "3000"}`;
  return `${base.replace(/\/$/, "")}/api/mcp/${SERVER_NAME}/${token}`;
}

type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
};

type CallToolContent =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string };

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

const PROTOCOL_VERSION = "2025-06-18";

// Minimal streamable-HTTP MCP server: initialize, tools/list, tools/call.
// Each POST is answered with a single JSON-RPC response — no session, no SSE.
// Returns null for notifications (the caller answers 202).
export async function handleBridgeRequest(
  token: string,
  request: JsonRpcRequest,
): Promise<Record<string, unknown> | null> {
  const bridge = bridges.get(token);
  if (!bridge) {
    return error(request.id, -32001, "this turn's tool bridge is closed");
  }
  bridge.expires = Date.now() + TTL_MS;

  switch (request.method) {
    case "initialize":
      return result(request.id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: SERVER_NAME, version: "0.1.0" },
      });
    case "notifications/initialized":
    case "notifications/cancelled":
      return null;
    case "ping":
      return result(request.id, {});
    case "tools/list":
      return result(request.id, { tools: listTools(bridge.tools) });
    case "tools/call":
      return callTool(bridge, request);
    default:
      return error(request.id, -32601, `unsupported method: ${request.method}`);
  }
}

function listTools(tools: ToolSet) {
  return Object.entries(tools as Record<string, Tool>).map(([name, t]) => ({
    name,
    description: typeof t.description === "string" ? t.description : name,
    inputSchema: jsonSchemaOf(t),
  }));
}

function jsonSchemaOf(t: Tool) {
  try {
    const schema = z.toJSONSchema(t.inputSchema as z.ZodType, {
      target: "draft-7",
      io: "input",
    });
    return schema as Record<string, unknown>;
  } catch {
    return { type: "object", properties: {} };
  }
}

async function callTool(bridge: Bridge, request: JsonRpcRequest) {
  const name = String(request.params?.name ?? "");
  const args = (request.params?.arguments ?? {}) as Record<string, unknown>;
  const t = (bridge.tools as Record<string, Tool>)[name];
  if (!t?.execute) {
    return error(request.id, -32602, `unknown tool: ${name}`);
  }
  const toolCallId = crypto.randomUUID();
  try {
    const output = await t.execute(args, {
      toolCallId,
      messages: [],
      context: undefined,
    });
    const key = stableKey(name, args);
    bridge.stash.set(key, [...(bridge.stash.get(key) ?? []), output]);
    const modelOutput = (
      t.toModelOutput
        ? await t.toModelOutput({ output, input: args, toolCallId })
        : { type: "json", value: output }
    ) as ModelOutput;
    return result(request.id, toCallToolResult(modelOutput));
  } catch (e) {
    return result(request.id, {
      content: [
        { type: "text", text: e instanceof Error ? e.message : String(e) },
      ],
      isError: true,
    });
  }
}

function toCallToolResult(out: ModelOutput): {
  content: CallToolContent[];
  isError?: boolean;
} {
  switch (out.type) {
    case "text":
      return { content: [{ type: "text", text: out.value }] };
    case "error-text":
      return { content: [{ type: "text", text: out.value }], isError: true };
    case "json":
      return { content: [{ type: "text", text: JSON.stringify(out.value) }] };
    case "content":
      return {
        content: out.value.map((b) =>
          b.type === "text"
            ? { type: "text", text: b.text }
            : {
                type: "image",
                mimeType: b.mediaType,
                data: typeof b.data === "string" ? b.data : b.data.data,
              },
        ),
      };
  }
}

function result(id: JsonRpcRequest["id"], value: unknown) {
  return { jsonrpc: "2.0" as const, id: id ?? null, result: value };
}

function error(id: JsonRpcRequest["id"], code: number, message: string) {
  return { jsonrpc: "2.0" as const, id: id ?? null, error: { code, message } };
}
