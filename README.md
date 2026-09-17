# rendr

Ask anything. The answer takes whatever shape fits it best.

rendr is a general assistant whose defining feature is the **interface**: the
agent chooses the best *form* for each reply — prose, structured components,
diagrams, interactive or animated pieces, persistent artifacts — instead of a
wall of text.

## Presentation channels

| Channel | Nature | Mechanism |
| --- | --- | --- |
| Prose | always on | Streamdown (markdown, mermaid, math, code) |
| Structured inline UI | ephemeral, constrained | json-render: shadcn primitives + chat pieces + response-shape composites (`lib/ui/catalog.ts`); Expand / Pin on every piece; a `reply` action so forms and Choices answer back |
| Freeform pieces | agent-authored HTML: animations, interactives, 3D, simulations | an **MCP Apps host**: the piece runs on a second origin behind a CSP; a pinned, load-tested CDN manifest (`lib/pieces/manifest.ts`) is the only source of libraries; `rendr.send()` / `rendr.setContext()` let the piece talk back |
| Artifacts | persistent, versioned, iterated | the stage: a pane of tabs; `html` / `mermaid` / `markdown` kinds, agent tools + user edits, version history |

## Research (MCP)

The agent can use any MCP server's tools. `rendr.mcp.json` lists them; with no
keys it runs DuckDuckGo search + page fetch (via `uvx`, so Python's `uv` must be
installed). Set `BRAVE_API_KEY` or `TAVILY_API_KEY` and the keyed provider
replaces DuckDuckGo automatically. Add any other server (stdio or HTTP) the same
way — Firecrawl, Exa, a database, your own. Found images go into an `Images`
piece with captions and source links; consecutive lookups collapse into one
"Looked up …" line in the thread.

## Models

Two backends behind one model picker (`lib/ai/models.ts`):

- **Claude, on your subscription** — `claude-*` ids run through the
  [Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview) under
  the Claude Code login on the machine (`claude` → `/login`; Pro/Max plans
  cover SDK usage). No API key; usage draws from the plan's limits. Each chat
  is an SDK session (`chat.claude_session_id`) that later turns resume, so the
  prompt-cache prefix is identical turn to turn; the system prompt is recorded
  once per session. The bridge is `lib/ai/claude/stream.ts`: rendr's tools are
  exposed to the SDK as an in-process MCP server, research servers from
  `rendr.mcp.json` are passed straight through, and the SDK's stream is
  translated into the same UI message chunks the AI SDK path produces.
- **OpenRouter** — everything else (and Claude via API billing if you prefer),
  through the AI SDK `ToolLoopAgent`. Needs `OPENROUTER_API_KEY`.

## Stack

Next.js 16 · React 19 · Tailwind 4 · shadcn (Radix) · AI Elements · AI SDK 7
(`ToolLoopAgent`) · Claude Agent SDK · OpenRouter · Streamdown · drizzle + libsql (SQLite) · Biome.

No accounts: a guest cookie scopes chats per browser. A collapsible sidebar
lists past conversations; attachments (images, PDFs, text) are stored under
`data/uploads`.

Pieces need a second origin for their sandbox. In development the app is
reached at `localhost:3000` and the sandbox at `127.0.0.1:3000` automatically;
in production set `NEXT_PUBLIC_SANDBOX_ORIGIN` (and `RENDR_HOST_ORIGINS` for the
`frame-ancestors` CSP).

## Running

Requires Node 22+ and pnpm.

```sh
cp .env.example .env.local   # OPENROUTER_API_KEY for non-Claude models; `claude` login for Claude
pnpm install
pnpm db:migrate
pnpm dev
```

## Layout

```
app/api/chat/route.ts      agent request handler; persists messages
lib/ai/agent.ts            ToolLoopAgent factory for the OpenRouter backend (tools are added per channel)
lib/ai/claude/             Claude Agent SDK backend: stream bridge + title generation
lib/ai/prompts.ts          identity + form-selection rubric, assembled per channel
lib/ai/models.ts           model list (Claude SDK ids + OpenRouter ids) and backends
lib/ai/tools/artifacts.ts  createArtifact / editArtifact / rewriteArtifact / readArtifact / listArtifacts
lib/ui/catalog.ts          inline-UI vocabulary (Zod); lib/ui/registry.tsx renders it
lib/mcp/                   MCP client registry: rendr.mcp.json → agent tools
lib/pieces/manifest.ts     pinned CDN library menu for pieces (also feeds the sandbox CSP)
lib/pieces/host.ts         MCP Apps host (AppBridge over the sandbox proxy)
public/sandbox.{html,js}   the sandbox proxy page (second origin)
public/piece-runtime.js    injected into every piece: bridge + `rendr` API
public/mcp-app.js          bundled @modelcontextprotocol/ext-apps app SDK (pnpm sync:mcp-app)
lib/artifacts/             kinds + server store (versions)
lib/db/                    drizzle schema, queries, migrations
stores/artifacts.ts        client store for the stage (artifacts, drafts, active tab)
components/chat/           chat shell, message part renderers, artifact cards, model picker,
                           history sidebar, attachments
app/api/                   chat (agent stream), artifacts, chats, upload, files
components/stage/          the stage pane, per-kind views, message-stream sync
components/ai-elements/    AI Elements (shadcn-style, re-addable via the CLI)
```

## License

Apache-2.0
