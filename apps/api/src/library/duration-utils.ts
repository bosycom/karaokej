import { open } from 'node:fs/promises';

/** Karaoke-safe upper bound for track length (24 hours). */
export const MAX_DURATION_MS = 24 * 60 * 60 * 1000;

export function sanitizeDurationMs(
  value: number | null | undefined,
): number | null {
  if (value == null || !Number.isFinite(value)) {
    return null;
  }
  const rounded = Math.round(value);
  if (rounded <= 0 || rounded > MAX_DURATION_MS) {
    return null;
  }
  if (rounded > Number.MAX_SAFE_INTEGER) {
    return null;
  }
  return rounded;
}

export async function readAudioHeaderBuffer(
  absolutePath: string,
  maxBytes: number,
): Promise<{ buffer: Buffer; fileSize: number }> {
  const fh = await open(absolutePath, 'r');
  try {
    const { size } = await fh.stat();
    if (size <= 0) {
      return { buffer: Buffer.alloc(0), fileSize: 0 };
    }
    const readLength = Math.min(maxBytes, size);
    const buffer = Buffer.alloc(readLength);
    await fh.read(buffer, 0, readLength, 0);
    return { buffer, fileSize: size };
  } finally {
    await fh.close();
  }
}

export const HEADER_READ_BYTES: Record<string, number> = {
  '.mp3': 256 * 1024,
  '.flac': 64 * 1024,
  '.opus': 64 * 1024,
};

export const MIME_BY_EXT: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.flac': 'audio/flac',
  '.opus': 'audio/ogg',
};
