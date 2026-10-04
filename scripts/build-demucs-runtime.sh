#!/usr/bin/env bash
# Assemble vendor/win/demucs-runtime.zip (offline CPU Demucs for Windows).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_ZIP="$ROOT/vendor/win/demucs-runtime.zip"
PYTHON_VERSION="${PYTHON_VERSION:-3.11.9}"
STAGING="$ROOT/vendor/win/demucs-staging"
WHEELS="$STAGING/wheels"

log() {
  printf '==> %s\n' "$*"
}

if [[ -f "$OUT_ZIP" ]] && [[ "${FORCE_DEMUCS:-0}" != "1" ]]; then
  log "Already present: demucs-runtime.zip"
  exit 0
fi

if [[ "${SKIP_DEMUCS:-0}" == "1" ]]; then
  log "SKIP_DEMUCS=1 — writing minimal placeholder zip"
  tmp="$(mktemp -d)"
  cat >"$tmp/install.ps1" <<'PS1'
param([Parameter(Mandatory=$true)][string]$TargetDir)
Write-Error "Demucs runtime was not built (SKIP_DEMUCS). Rebuild the installer with build-demucs-runtime.sh."
exit 1
PS1
  (cd "$tmp" && zip -qr "$OUT_ZIP" install.ps1)
  rm -rf "$tmp"
  exit 0
fi

command -v python3 >/dev/null 2>&1 || { echo "python3 required for pip download" >&2; exit 1; }
command -v zip >/dev/null 2>&1 || { echo "zip required" >&2; exit 1; }

rm -rf "$STAGING"
mkdir -p "$WHEELS" "$STAGING/embed"

embed_zip="python-${PYTHON_VERSION}-embed-amd64.zip"
embed_url="https://www.python.org/ftp/python/${PYTHON_VERSION}/${embed_zip}"
log "Downloading Python embed $PYTHON_VERSION"
curl -fL --retry 3 -o "$STAGING/$embed_zip" "$embed_url"
unzip -q "$STAGING/$embed_zip" -d "$STAGING/embed"

log "Downloading Windows wheels (CPU PyTorch + Demucs); this can take several minutes"
python3 -m pip download --upgrade pip >/dev/null
python3 -m pip download \
  --dest "$WHEELS" \
  --platform win_amd64 \
  --python-version "${PYTHON_VERSION%%.*}" \
  --implementation cp \
  --abi cp311 \
  --only-binary=:all: \
  torch torchvision torchaudio \
  --index-url https://download.pytorch.org/whl/cpu

python3 -m pip download \
  --dest "$WHEELS" \
  --platform win_amd64 \
  --python-version "${PYTHON_VERSION%%.*}" \
  --implementation cp \
  --abi cp311 \
  demucs

cat >"$STAGING/install.ps1" <<'PS1'
param(
  [Parameter(Mandatory = $true)]
  [string]$TargetDir
)
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force -Path $TargetDir | Out-Null
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Copy-Item -Path (Join-Path $here 'embed\*') -Destination $TargetDir -Recurse -Force
$pth = Join-Path $TargetDir 'python311._pth'
if (Test-Path $pth) {
  $lines = Get-Content $pth | Where-Object { $_ -notmatch '^#\s*import site' }
  if ($lines -notcontains 'import site') {
    $lines += 'import site'
  }
  Set-Content -Path $pth -Value $lines -Encoding ascii
}
$python = Join-Path $TargetDir 'python.exe'
$wheels = Join-Path $here 'wheels'
& $python -m ensurepip --upgrade
& $python -m pip install --no-index --find-links $wheels demucs
Write-Host "Demucs installed to $TargetDir"
PS1

rm -f "$OUT_ZIP"
(cd "$STAGING" && zip -qr "$OUT_ZIP" install.ps1 embed wheels)
log "Wrote $OUT_ZIP ($(du -h "$OUT_ZIP" | cut -f1))"
