@AGENTS.md

# rendr

See README.md for the presentation-channel model and layout. Conventions:

- Each presentation channel owns: a prompt section in `lib/ai/prompts.ts`, its
  tools in `lib/ai/tools/`, and a part renderer in
  `components/chat/message-parts.tsx`.
- AI Elements live in `components/ai-elements/` and are re-added via
  `pnpm dlx shadcn@latest add https://elements.ai-sdk.dev/api/registry/<name>.json`;
  shadcn primitives via `pnpm dlx shadcn@latest add <name>`. Don't hand-edit
  them unless necessary.
- Model ids must exist on OpenRouter (`https://openrouter.ai/api/v1/models`).
- Lint/format with `pnpm lint` / `pnpm format` (Biome).
- No eval harness by design: the owner judges form choices and iterates on
  the prompt/catalog on request.
