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
| Structured inline UI | ephemeral, constrained | json-render over a shadcn catalog *(step 3)* |
| Freeform pieces | agent-authored HTML, animations, interactives | sandboxed MCP Apps host with a pinned CDN library manifest *(step 4)* |
| Artifacts | persistent, versioned, iterated | side pane; `html` / `mermaid` / `markdown` kinds *(step 2)* |

## Stack

Next.js 16 · React 19 · Tailwind 4 · shadcn (Radix) · AI Elements · AI SDK 7
(`ToolLoopAgent`) · OpenRouter · Streamdown · drizzle + libsql (SQLite) · Biome.

No accounts: a guest cookie scopes chats per browser.

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
lib/db/                    drizzle schema, queries, migrations
components/chat/           chat shell, message part renderers, model picker
components/ai-elements/    AI Elements (shadcn-style, re-addable via the CLI)
```

## License

Apache-2.0
