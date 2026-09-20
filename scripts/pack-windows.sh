#!/usr/bin/env bash
# Build a copy-ready Windows folder at deploy-windows/.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${DEST:-$ROOT/deploy-windows}"
NODE_WIN_VERSION="${NODE_WIN_VERSION:-}"

log() {
  printf '==> %s\n' "$*"
}

if ! command -v node >/dev/null 2>&1; then
  echo "node is required to pack" >&2
  exit 1
fi

if [[ -z "$NODE_WIN_VERSION" ]]; then
  NODE_WIN_VERSION="$(node -p "process.versions.node")"
fi

major="${NODE_WIN_VERSION%%.*}"
if [[ "$major" -lt 22 ]]; then
  echo "Packing requires Node 22+ to choose a matching Windows runtime (found $NODE_WIN_VERSION)" >&2
  exit 1
fi

cd "$ROOT"
log "Building Karaokej"
npm run build

log "Creating $DEST"
rm -rf "$DEST"
mkdir -p \
  "$DEST/apps/api" \
  "$DEST/apps/web" \
  "$DEST/packages/shared" \
  "$DEST/data"

cp "$ROOT/package.json" "$ROOT/package-lock.json" "$DEST/"
cp "$ROOT/apps/api/package.json" "$DEST/apps/api/"
cp "$ROOT/apps/web/package.json" "$DEST/apps/web/"
cp "$ROOT/packages/shared/package.json" "$DEST/packages/shared/"
cp -a "$ROOT/apps/api/dist" "$DEST/apps/api/"
cp -a "$ROOT/apps/web/dist" "$DEST/apps/web/"
cp -a "$ROOT/packages/shared/dist" "$DEST/packages/shared/"
cp "$ROOT/scripts/windows/setup.ps1" "$DEST/setup.ps1"
cp "$ROOT/scripts/windows/start.ps1" "$DEST/start.ps1"
cp "$ROOT/scripts/windows/README.md" "$DEST/README.md"

if [[ -f "$ROOT/data/karaokej.sqlite" ]] && command -v sqlite3 >/dev/null 2>&1; then
  log "Checkpointing SQLite WAL"
  sqlite3 "$ROOT/data/karaokej.sqlite" "PRAGMA wal_checkpoint(FULL);" >/dev/null || \
    echo "Warning: could not checkpoint WAL; copying sidecar files if present." >&2
fi

copied_db=0
for name in karaokej.sqlite karaokej.sqlite-wal karaokej.sqlite-shm; do
  if [[ -f "$ROOT/data/$name" ]]; then
    cp -a "$ROOT/data/$name" "$DEST/data/"
    copied_db=1
  fi
done
if [[ "$copied_db" -eq 0 ]]; then
  echo "Warning: no data/karaokej.sqlite found. Stop the app and re-pack if you want the existing catalogue." >&2
fi
if [[ -d "$ROOT/data/covers" ]]; then
  cp -a "$ROOT/data/covers" "$DEST/data/covers"
fi

zip_name="node-v${NODE_WIN_VERSION}-win-x64.zip"
url="https://nodejs.org/dist/v${NODE_WIN_VERSION}/${zip_name}"
tmp="$(mktemp -d)"
cleanup() { rm -rf "$tmp"; }
trap cleanup EXIT

log "Downloading portable Node $NODE_WIN_VERSION (win-x64)"
if command -v curl >/dev/null 2>&1; then
  curl -fL --retry 3 -o "$tmp/$zip_name" "$url"
elif command -v wget >/dev/null 2>&1; then
  wget -O "$tmp/$zip_name" "$url"
else
  echo "curl or wget is required to download Node for Windows" >&2
  exit 1
fi

if command -v unzip >/dev/null 2>&1; then
  unzip -q "$tmp/$zip_name" -d "$tmp"
elif command -v python3 >/dev/null 2>&1; then
  python3 - "$tmp/$zip_name" "$tmp" <<'PY'
import sys, zipfile
zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])
PY
else
  echo "unzip or python3 is required to extract the Node zip" >&2
  exit 1
fi

extracted="$tmp/node-v${NODE_WIN_VERSION}-win-x64"
if [[ ! -d "$extracted" ]]; then
  echo "Unexpected Node zip layout; expected $extracted" >&2
  exit 1
fi
mv "$extracted" "$DEST/node"

archive="$ROOT/deploy-windows.zip"
log "Writing $archive"
rm -f "$archive"
if command -v zip >/dev/null 2>&1; then
  (cd "$ROOT" && zip -qr "$archive" deploy-windows)
else
  python3 - "$archive" "$DEST" <<'PY'
import pathlib, sys, zipfile
archive = pathlib.Path(sys.argv[1])
source = pathlib.Path(sys.argv[2])
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as zf:
    for path in source.rglob('*'):
        zf.write(path, pathlib.Path('deploy-windows') / path.relative_to(source))
PY
fi

log "Packed $DEST"
log "Copy that folder (or deploy-windows.zip) to the Windows PC and run setup.ps1"
