import "server-only";

import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

// rendr.mcp.json — which MCP servers the agent can use. Stdio servers are
// spawned locally; http servers are remote. See the file for the semantics of
// `requires` / `unless` / `${VAR}`.

const stdioSchema = z.object({
  description: z.string().optional(),
  command: z.string(),
  args: z.array(z.string()).default([]),
  env: z.record(z.string(), z.string()).optional(),
  cwd: z.string().optional(),
  requires: z.array(z.string()).default([]),
  unless: z.array(z.string()).default([]),
});

const httpSchema = z.object({
  description: z.string().optional(),
  url: z.string().url(),
  headers: z.record(z.string(), z.string()).optional(),
  requires: z.array(z.string()).default([]),
  unless: z.array(z.string()).default([]),
});

const configSchema = z.object({
  servers: z.record(z.string(), z.union([stdioSchema, httpSchema])),
});

export type McpServerConfig =
  | ({ name: string; kind: "stdio" } & z.infer<typeof stdioSchema>)
  | ({ name: string; kind: "http" } & z.infer<typeof httpSchema>);

const CONFIG_PATH =
  process.env.RENDR_MCP_CONFIG ?? path.join(process.cwd(), "rendr.mcp.json");

function substitute(value: string): string {
  return value.replace(
    /\$\{([A-Z0-9_]+)\}/g,
    (_, name) => process.env[name] ?? "",
  );
}

function substituteRecord(record?: Record<string, string>) {
  return record
    ? Object.fromEntries(
        Object.entries(record).map(([k, v]) => [k, substitute(v)]),
      )
    : undefined;
}

// Servers that are enabled in this environment, with variables substituted.
export function loadMcpConfig(): McpServerConfig[] {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
  } catch {
    return [];
  }
  const parsed = configSchema.safeParse(raw);
  if (!parsed.success) {
    console.warn("[mcp] invalid rendr.mcp.json:", parsed.error.message);
    return [];
  }

  const enabled: McpServerConfig[] = [];
  for (const [name, server] of Object.entries(parsed.data.servers)) {
    if (server.requires.some((v) => !process.env[v])) {
      continue;
    }
    if (server.unless.some((v) => process.env[v])) {
      continue;
    }
    if ("url" in server) {
      enabled.push({
        name,
        kind: "http",
        ...server,
        url: substitute(server.url),
        headers: substituteRecord(server.headers),
      });
    } else {
      enabled.push({
        name,
        kind: "stdio",
        ...server,
        args: server.args.map(substitute),
        env: substituteRecord(server.env),
      });
    }
  }
  return enabled;
}
