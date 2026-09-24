# rendr — one Next.js server with both subscription CLIs (Claude Agent SDK,
# Codex) and uv for the keyless research MCP servers.

FROM node:24-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /app

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
COPY . .
# Both are baked in at build time: NEXT_PUBLIC_* is inlined into the client
# bundle, and the sandbox CSP (next.config.ts headers) is written to the
# routes manifest.
ARG NEXT_PUBLIC_SANDBOX_ORIGIN
ARG RENDR_HOST_ORIGINS
ENV NEXT_PUBLIC_SANDBOX_ORIGIN=$NEXT_PUBLIC_SANDBOX_ORIGIN \
    RENDR_HOST_ORIGINS=$RENDR_HOST_ORIGINS
# The db client opens ./data/rendr.db at import, which page-data collection
# triggers; the directory has to exist (it's excluded from the context).
RUN mkdir -p data && pnpm build && pnpm prune --prod

FROM base AS runtime
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY --from=ghcr.io/astral-sh/uv:0.12.0 /uv /uvx /usr/local/bin/

ENV NODE_ENV=production PORT=3000 \
    # Everything stateful lives under the data mount: the SQLite db, uploads,
    # session dirs, and HOME (Claude Code config, Codex login, uv/npx caches).
    HOME=/app/data/home \
    DATABASE_URL=file:./data/rendr.db

COPY --from=build --chown=node:node /app/package.json /app/next.config.ts /app/rendr.mcp.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/lib ./lib
COPY --chown=node:node docker-entrypoint.sh /usr/local/bin/

# The Claude Agent SDK runs with bypassed permissions, which Claude Code
# refuses to do as root.
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 3000
ENTRYPOINT ["docker-entrypoint.sh"]
