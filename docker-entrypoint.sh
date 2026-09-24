#!/bin/sh
set -e

mkdir -p "$HOME"
# Node strips the types; no tsx needed in the image.
node lib/db/migrate.ts
exec node_modules/.bin/next start
