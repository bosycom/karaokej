import { AudioFormat } from '@karaokej/shared';
import { readdir, stat } from 'node:fs/promises';
import { basename, extname, join, relative } from 'node:path';

export const AUDIO_EXTENSIONS: Record<string, AudioFormat> = {
  '.mp3': 'mp3',
  '.flac': 'flac',
  '.opus': 'opus',
};

const SKIP_DIR_NAMES = new Set([
  '.git',
  '.ds_store',
  'node_modules',
  '@eadir',
  '#recycle',
  '.recycle',
  '.trashes',
]);

export interface WalkedFile {
  absolutePath: string;
  relativePath: string;
  sizeBytes: number;
  mtimeMs: number;
  format: AudioFormat;
}

export function isJunkDir(name: string): boolean {
  const lower = name.toLowerCase();
  if (SKIP_DIR_NAMES.has(lower)) {
    return true;
  }
  if (lower.startsWith('.trash')) {
    return true;
  }
  if (name.startsWith('._')) {
    return true;
  }
  return false;
}

export async function walkAudioFiles(
  libraryRoot: string,
  shouldAbort?: () => boolean,
): Promise<WalkedFile[]> {
  const results: WalkedFile[] = [];

  async function visit(dir: string): Promise<void> {
    if (shouldAbort?.()) {
      return;
    }
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (shouldAbort?.()) {
        return;
      }
      if (entry.name.startsWith('._')) {
        continue;
      }
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!isJunkDir(entry.name)) {
          await visit(full);
        }
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      const ext = extname(entry.name).toLowerCase();
      const format = AUDIO_EXTENSIONS[ext];
      if (!format) {
        continue;
      }
      try {
        const info = await stat(full);
        results.push({
          absolutePath: full,
          relativePath: relative(libraryRoot, full),
          sizeBytes: info.size,
          mtimeMs: Math.floor(info.mtimeMs),
          format,
        });
      } catch {
        // File vanished between readdir and stat.
      }
    }
  }

  await visit(libraryRoot);
  return results;
}

export function lyricPathFor(audioPath: string): string {
  const ext = extname(audioPath);
  return audioPath.slice(0, audioPath.length - ext.length) + '.lrc';
}

export function normalizeToken(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function makeFingerprint(
  artist: string | null,
  title: string,
  sizeBytes: number,
  durationMs: number | null,
): string {
  return [
    normalizeToken(artist),
    normalizeToken(title),
    String(sizeBytes),
    String(durationMs ?? 0),
  ].join('|');
}

export function fallbackMetadata(
  relativePath: string,
  stem: string,
): { title: string; artist: string | null; album: string | null } {
  const parts = relativePath.split(/[/\\]/).filter(Boolean);
  const fileStem = stem || basename(relativePath, extname(relativePath));

  const dash = fileStem.match(/^(.*?)\s+-\s+(.*)$/);
  if (dash) {
    return {
      artist: dash[1].trim() || null,
      title: dash[2].trim() || fileStem,
      album: parts.length >= 2 ? parts[parts.length - 2] : null,
    };
  }

  const album = parts.length >= 2 ? parts[parts.length - 2] : null;
  const artist = parts.length >= 3 ? parts[parts.length - 3] : null;
  return {
    title: fileStem,
    artist,
    album,
  };
}

export function yieldEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}
