#!/usr/bin/env bash
# Stage production NestJS bundle (packed under resources/app/karaokej-server).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAGE="$ROOT/dist/electron-app"

log() {
  printf '==> %s\n' "$*"
}

cd "$ROOT"
log "Building workspaces"
npm run build

log "Preparing $STAGE"
rm -rf "$STAGE"
mkdir -p \
  "$STAGE/apps/api" \
  "$STAGE/apps/web" \
  "$STAGE/packages/shared"

cp "$ROOT/package.json" "$ROOT/package-lock.json" "$STAGE/"
cp "$ROOT/apps/api/package.json" "$STAGE/apps/api/"
cp "$ROOT/apps/web/package.json" "$STAGE/apps/web/"
cp "$ROOT/packages/shared/package.json" "$STAGE/packages/shared/"
cp -a "$ROOT/apps/api/dist" "$STAGE/apps/api/"
cp -a "$ROOT/apps/web/dist" "$STAGE/apps/web/"
cp -a "$ROOT/packages/shared/dist" "$STAGE/packages/shared/"

log "Installing production dependencies in stage"
(
  cd "$STAGE"
  npm ci --omit=dev
)

log "Stage ready at dist/electron-app"
