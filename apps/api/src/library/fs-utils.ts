import { AudioFormat } from '@karaokej/shared';
import { basename, extname } from 'node:path';

export const AUDIO_EXTENSIONS: Record<string, AudioFormat> = {
  '.mp3': 'mp3',
  '.flac': 'flac',
  '.opus': 'opus',
};

export const SCAN_FILE_CHUNK_SIZE = 1000;

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

export interface ExistingTrackFingerprint {
  size_bytes: number;
  mtime_ms: number;
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

export function isUnchangedFile(
  file: Pick<WalkedFile, 'sizeBytes' | 'mtimeMs'>,
  existing: ExistingTrackFingerprint | undefined,
): boolean {
  if (!existing) {
    return false;
  }
  return (
    existing.size_bytes === file.sizeBytes && existing.mtime_ms === file.mtimeMs
  );
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

export interface ScanProgressFolder {
  label: string;
  index: number;
  total: number;
  resuming?: boolean;
}

export function formatScanProgressMessage(
  folder: ScanProgressFolder,
  processed: number,
  skippedDirs = 0,
): string {
  const prefix = folder.resuming ? 'Resuming' : 'Scanning';
  const folderPart = `${prefix} ${folder.label} (${folder.index}/${folder.total})`;
  const countPart =
    processed > 0 ? ` · ${processed.toLocaleString()} files` : '';
  const skipPart =
    skippedDirs > 0
      ? ` · ${skippedDirs.toLocaleString()} ${skippedDirs === 1 ? 'dir' : 'dirs'} skipped`
      : '';
  return `${folderPart}${countPart}${skipPart}`;
}

export function formatScanCompleteMessage(
  processed: number,
  skippedDirs: number,
): string {
  const base = `Indexed ${processed.toLocaleString()} tracks`;
  if (skippedDirs <= 0) {
    return base;
  }
  return `${base} · ${skippedDirs.toLocaleString()} ${skippedDirs === 1 ? 'folder' : 'folders'} skipped`;
}
