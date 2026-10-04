#!/usr/bin/env bash
# NSIS uninstaller generation on Linux/WSL uses Wine by default, but the NSIS stub
# is 32-bit and often fails without wine32. electron-builder already ships
# UninstallerReader for macOS; enable the same path on Linux.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="$ROOT/node_modules/app-builder-lib/out/targets/nsis/NsisTarget.js"

if [[ ! -f "$TARGET" ]]; then
  echo "Missing $TARGET — run npm install first" >&2
  exit 1
fi

if grep -q 'process.platform === "linux"' "$TARGET"; then
  exit 0
fi

python3 - "$TARGET" <<'PY'
import sys
from pathlib import Path

path = Path(sys.argv[1])
text = path.read_text()
needle = "if ((0, macosVersion_1.isMacOsCatalina)()) {"
replacement = 'if ((0, macosVersion_1.isMacOsCatalina)() || process.platform === "linux") {'
if needle not in text:
    print("patch target changed; update patch-electron-builder-linux-nsis.sh", file=sys.stderr)
    sys.exit(1)
path.write_text(text.replace(needle, replacement, 1))
print(f"Patched {path.name} for Linux NSIS uninstaller extraction")
PY
