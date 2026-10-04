#!/usr/bin/env bash
# Download Windows x64 binaries into vendor/win/bin (ffmpeg, ffprobe, yt-dlp).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BIN="$ROOT/vendor/win/bin"
CACHE="$ROOT/vendor/win/cache"
FFMPEG_VERSION="${FFMPEG_VERSION:-}"
YTDLP_URL="${YTDLP_URL:-https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe}"

log() {
  printf '==> %s\n' "$*"
}

mkdir -p "$BIN"

download() {
  local url="$1"
  local dest="$2"
  if [[ -f "$dest" ]] && [[ "${FORCE_VENDOR:-0}" != "1" ]]; then
    log "Already present: $(basename "$dest")"
    return 0
  fi
  log "Downloading $(basename "$dest")"
  if command -v curl >/dev/null 2>&1; then
    curl -fL --retry 3 -o "$dest" "$url"
  elif command -v wget >/dev/null 2>&1; then
    wget -O "$dest" "$url"
  else
    echo "curl or wget required" >&2
    exit 1
  fi
}

ffmpeg_zip="ffmpeg-master-latest-win64-gpl.zip"

if [[ -f "$BIN/ffmpeg.exe" && -f "$BIN/ffprobe.exe" && "${FORCE_VENDOR:-0}" != "1" ]]; then
  log "Already present: ffmpeg.exe, ffprobe.exe"
else
  if [[ -z "$FFMPEG_VERSION" ]]; then
    FFMPEG_VERSION="$(curl -fsSL https://api.github.com/repos/BtbN/FFmpeg-Builds/releases/latest | grep -oP '(?<="tag_name": ")[^"]+' | head -1)"
  fi
  ffmpeg_url="https://github.com/BtbN/FFmpeg-Builds/releases/download/${FFMPEG_VERSION}/${ffmpeg_zip}"
  mkdir -p "$CACHE"
  cached_zip="$CACHE/${FFMPEG_VERSION}-${ffmpeg_zip}"

  if [[ -f "$cached_zip" && "${FORCE_VENDOR:-0}" != "1" ]]; then
    log "Using cached $(basename "$cached_zip")"
  else
    log "Downloading ${ffmpeg_zip} (${FFMPEG_VERSION})"
    download "$ffmpeg_url" "$cached_zip"
  fi

  tmp="$(mktemp -d)"
  cleanup() { rm -rf "$tmp"; }
  trap cleanup EXIT

  cp "$cached_zip" "$tmp/ffmpeg.zip"
  if command -v unzip >/dev/null 2>&1; then
    unzip -q "$tmp/ffmpeg.zip" -d "$tmp/ffmpeg"
  else
    echo "unzip required to extract ffmpeg" >&2
    exit 1
  fi

  ffmpeg_bin="$(find "$tmp/ffmpeg" -name ffmpeg.exe -print -quit)"
  ffprobe_bin="$(find "$tmp/ffmpeg" -name ffprobe.exe -print -quit)"
  if [[ -z "$ffmpeg_bin" ]] || [[ -z "$ffprobe_bin" ]]; then
    echo "ffmpeg.exe or ffprobe.exe not found in archive" >&2
    exit 1
  fi
  cp "$ffmpeg_bin" "$BIN/ffmpeg.exe"
  cp "$ffprobe_bin" "$BIN/ffprobe.exe"
  chmod +x "$BIN/ffmpeg.exe" "$BIN/ffprobe.exe"
fi

download "$YTDLP_URL" "$BIN/yt-dlp.exe"
chmod +x "$BIN/yt-dlp.exe"

log "Vendor binaries ready in vendor/win/bin"
