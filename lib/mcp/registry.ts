import "server-only";

import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { jsonSchema, type Tool, type ToolSet, tool } from "ai";
import { loadMcpConfig, type McpServerConfig } from "./config";

// Turns the servers in rendr.mcp.json into AI SDK tools for the agent.
// Clients are connected once per process and reused across requests (a stdio
// server is a child process; spawning one per chat message would be slow).
// A server that fails to connect is skipped for this request and retried on
// the next; a server that dies is reconnected.

type Connected = {
  config: McpServerConfig;
  client: Client;
  tools: ToolSet;
};

const CLIENT_INFO = { name: "rendr", version: "0.1.0" };
const CONNECT_TIMEOUT_MS = 20_000;

type Registry = { connections: Map<string, Promise<Connected | null>> };
const g = globalThis as typeof globalThis & { __rendrMcp?: Registry };
const registry: Registry = (g.__rendrMcp ??= { connections: new Map() });

// Anthropic tool names: ^[a-zA-Z0-9_-]{1,128}$
function toolName(server: string, name: string) {
  return `${server}_${name}`.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 128);
}

async function connect(config: McpServerConfig): Promise<Connected | null> {
  const client = new Client(CLIENT_INFO);
  const transport =
    config.kind === "stdio"
      ? new StdioClientTransport({
          command: config.command,
          args: config.args,
          env: { ...process.env, ...config.env } as Record<string, string>,
          cwd: config.cwd,
          stderr: "ignore",
        })
      : new StreamableHTTPClientTransport(new URL(config.url), {
          requestInit: { headers: config.headers },
        });

  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("connect timeout")), CONNECT_TIMEOUT_MS),
  );
  try {
    await Promise.race([client.connect(transport), timeout]);
  } catch (error) {
    console.warn(
      `[mcp] ${config.name}: failed to connect —`,
      error instanceof Error ? error.message : error,
    );
    return null;
  }

  client.onclose = () => {
    registry.connections.delete(config.name);
  };

  const { tools: definitions } = await client.listTools();
  const tools: ToolSet = {};
  for (const def of definitions) {
    tools[toolName(config.name, def.name)] = tool({
      description: `[${config.name}] ${def.description ?? def.name}`,
      inputSchema: jsonSchema(
        def.inputSchema as Parameters<typeof jsonSchema>[0],
      ),
      execute: async (args) => {
        const result = await client.callTool({
          name: def.name,
          arguments: args as Record<string, unknown>,
        });
        return result;
      },
      // The model sees text blocks as text (and images as files); the UI
      // keeps the full result for its own rendering.
      toModelOutput: ({ output }) => {
        const result = output as {
          content?: Array<Record<string, unknown>>;
          isError?: boolean;
        };
        const blocks = result.content ?? [];
        const text = blocks
          .filter((b) => b.type === "text")
          .map((b) => String(b.text ?? ""))
          .join("\n");
        if (result.isError) {
          return { type: "error-text", value: text || "tool error" };
        }
        const images = blocks.filter(
          (b) => b.type === "image" && typeof b.data === "string",
        );
        if (images.length === 0) {
          return { type: "text", value: text };
        }
        return {
          type: "content",
          value: [
            ...(text ? [{ type: "text" as const, text }] : []),
            ...images.map((b) => ({
              type: "file" as const,
              mediaType: String(b.mimeType ?? "image/png"),
              data: { type: "data" as const, data: String(b.data) },
            })),
          ],
        };
      },
    }) as Tool;
  }

  console.log(
    `[mcp] ${config.name}: ${definitions.length} tool(s) — ${definitions.map((d) => d.name).join(", ")}`,
  );
  return { config, client, tools };
}

// All tools from all enabled servers, plus a short description per server
// for the system prompt.
export async function getMcpTools(): Promise<{
  tools: ToolSet;
  servers: string[];
}> {
  const configs = loadMcpConfig();
  const results = await Promise.all(
    configs.map((config) => {
      let pending = registry.connections.get(config.name);
      if (!pending) {
        pending = connect(config);
        registry.connections.set(config.name, pending);
        pending.then((c) => {
          if (!c) {
            registry.connections.delete(config.name);
          }
        });
      }
      return pending;
    }),
  );

  const tools: ToolSet = {};
  const servers: string[] = [];
  for (const connected of results) {
    if (!connected) {
      continue;
    }
    Object.assign(tools, connected.tools);
    const names = Object.keys(connected.tools).join(", ");
    servers.push(
      `- ${connected.config.name}${connected.config.description ? ` — ${connected.config.description}` : ""}: ${names}`,
    );
  }
  return { tools, servers };
}
