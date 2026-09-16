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

## Stack

Next.js 16 · React 19 · Tailwind 4 · shadcn (Radix) · AI Elements · AI SDK 7
(`ToolLoopAgent`) · OpenRouter · Streamdown · drizzle + libsql (SQLite) · Biome.

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
cp .env.example .env.local   # set OPENROUTER_API_KEY
pnpm install
pnpm db:migrate
pnpm dev
```

## Layout

```
app/api/chat/route.ts      agent request handler; persists messages
lib/ai/agent.ts            ToolLoopAgent factory (tools are added per channel)
lib/ai/prompts.ts          identity + form-selection rubric, assembled per channel
lib/ai/models.ts           model list (OpenRouter ids)
lib/ai/tools/artifacts.ts  createArtifact / editArtifact / rewriteArtifact / readArtifact / listArtifacts
lib/ui/catalog.ts          inline-UI vocabulary (Zod); lib/ui/registry.tsx renders it
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
