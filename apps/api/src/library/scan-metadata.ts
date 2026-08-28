import { basename, extname } from 'node:path';
import type { IAudioMetadata } from 'music-metadata';
import { fallbackMetadata } from './fs-utils';
import { withFsOp } from './fs-timeout';
import {
  flacDurationFromHeader,
  HEADER_READ_BYTES,
  isFlacPath,
  isMp3Path,
  isOggContainerPath,
  MIME_BY_EXT,
  mp3DurationFromHeader,
  opusDurationFromTail,
  readAudioHeaderBuffer,
} from './duration-utils';
import { ratingFromMetadata } from '../rating/rating-tags';
import type { ParsedTrackMetadata } from './scan-ipc';

export type ScanDurationMode = 'header_only' | 'full_fallback';

function yearFromMetadata(common: {
  year?: number | null;
  date?: string | null;
}): number | null {
  if (common.year != null && common.year > 0) {
    return common.year;
  }
  if (common.date) {
    const year = new Date(common.date).getFullYear();
    if (Number.isFinite(year) && year > 0) {
      return year;
    }
  }
  return null;
}

function genresFromMetadata(common: { genre?: string[] | null }): string[] {
  const raw = common.genre ?? [];
  const seen = new Set<string>();
  const genres: string[] = [];
  for (const g of raw) {
    const trimmed = g.trim();
    if (!trimmed) {
      continue;
    }
    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    genres.push(trimmed);
  }
  return genres;
}

function durationMsFromMeta(meta: IAudioMetadata): number | null {
  const duration = meta.format.duration;
  return duration != null && duration > 0 ? Math.round(duration * 1000) : null;
}

function metadataFromParsed(
  meta: IAudioMetadata,
  relativePath: string,
  stem: string,
  durationMs: number | null,
): ParsedTrackMetadata {
  const fallback = fallbackMetadata(relativePath, stem);
  const common = meta.common;
  return {
    title: common.title?.trim() || fallback.title,
    artist:
      common.artist?.trim() ||
      common.albumartist?.trim() ||
      fallback.artist,
    album: common.album?.trim() || fallback.album,
    albumArtist: common.albumartist?.trim() || null,
    trackNo: common.track?.no ?? null,
    durationMs,
    rating: ratingFromMetadata(meta),
    year: yearFromMetadata(common),
    genres: genresFromMetadata(common),
  };
}

async function formatSpecificDurationMs(
  absolutePath: string,
  headerBuffer: Buffer,
  fileSize: number,
): Promise<number | null> {
  if (isFlacPath(absolutePath)) {
    return flacDurationFromHeader(headerBuffer);
  }
  if (isMp3Path(absolutePath)) {
    return mp3DurationFromHeader(headerBuffer, fileSize);
  }
  if (isOggContainerPath(absolutePath)) {
    try {
      return await opusDurationFromTail(absolutePath);
    } catch {
      return null;
    }
  }
  return null;
}

export async function resolveTrackDurationMs(
  absolutePath: string,
  meta: IAudioMetadata,
  parseFile: (
    path: string,
    options: { duration: boolean; skipCovers: boolean },
  ) => Promise<IAudioMetadata>,
  fsTimeoutMs: number,
  relativePath: string,
  options: {
    durationMode: ScanDurationMode;
    headerBuffer?: Buffer;
    fileSize?: number;
  },
): Promise<{ durationMs: number | null; usedFallback: boolean }> {
  const headerDuration = durationMsFromMeta(meta);
  if (headerDuration != null) {
    return { durationMs: headerDuration, usedFallback: false };
  }

  if (options.headerBuffer && options.fileSize != null) {
    const formatDuration = await formatSpecificDurationMs(
      absolutePath,
      options.headerBuffer,
      options.fileSize,
    );
    if (formatDuration != null) {
      return { durationMs: formatDuration, usedFallback: false };
    }
  } else {
    if (isOggContainerPath(absolutePath)) {
      try {
        const tailDuration = await opusDurationFromTail(absolutePath);
        if (tailDuration != null) {
          return { durationMs: tailDuration, usedFallback: false };
        }
      } catch {
        /* fall through */
      }
    }
  }

  if (options.durationMode === 'header_only') {
    return { durationMs: null, usedFallback: false };
  }

  try {
    const full = await withFsOp(`parse ${relativePath}`, fsTimeoutMs, () =>
      parseFile(absolutePath, { duration: true, skipCovers: true }),
    );
    return {
      durationMs: durationMsFromMeta(full),
      usedFallback: true,
    };
  } catch {
    return { durationMs: null, usedFallback: true };
  }
}

export interface ReadTrackMetadataOptions {
  fsTimeoutMs: number;
  durationMode?: ScanDurationMode;
}

export interface ReadTrackMetadataResult {
  metadata: ParsedTrackMetadata;
  usedDurationFallback: boolean;
}

async function parseTagsFromHeader(
  absolutePath: string,
  fsTimeoutMs: number,
  relativePath: string,
): Promise<{
  meta: IAudioMetadata;
  headerBuffer: Buffer;
  fileSize: number;
}> {
  const ext = extname(absolutePath).toLowerCase();
  const maxBytes = HEADER_READ_BYTES[ext] ?? 256 * 1024;
  const mimeType = MIME_BY_EXT[ext] ?? 'application/octet-stream';
  const { buffer, fileSize } = await readAudioHeaderBuffer(absolutePath, maxBytes);
  const { parseBuffer } = await import('music-metadata');
  const meta = await withFsOp(`parse ${relativePath}`, fsTimeoutMs, () =>
    parseBuffer(
      buffer,
      { mimeType, size: fileSize },
      { duration: false, skipCovers: true },
    ),
  );
  return { meta, headerBuffer: buffer, fileSize };
}

export async function readTrackMetadata(
  absolutePath: string,
  relativePath: string,
  options: ReadTrackMetadataOptions | number,
): Promise<ReadTrackMetadataResult> {
  const resolved: ReadTrackMetadataOptions =
    typeof options === 'number'
      ? { fsTimeoutMs: options, durationMode: 'full_fallback' }
      : {
          fsTimeoutMs: options.fsTimeoutMs,
          durationMode: options.durationMode ?? 'full_fallback',
        };
  const stem = basename(absolutePath, extname(absolutePath));
  const fallback = fallbackMetadata(relativePath, stem);
  try {
    const { parseFile } = await import('music-metadata');
    const { meta, headerBuffer, fileSize } = await parseTagsFromHeader(
      absolutePath,
      resolved.fsTimeoutMs,
      relativePath,
    );
    const { durationMs, usedFallback } = await resolveTrackDurationMs(
      absolutePath,
      meta,
      parseFile,
      resolved.fsTimeoutMs,
      relativePath,
      {
        durationMode: resolved.durationMode ?? 'full_fallback',
        headerBuffer,
        fileSize,
      },
    );
    return {
      metadata: metadataFromParsed(meta, relativePath, stem, durationMs),
      usedDurationFallback: usedFallback,
    };
  } catch {
    return {
      metadata: {
        ...fallback,
        albumArtist: null,
        trackNo: null,
        durationMs: null,
        rating: 0,
        year: null,
        genres: [],
      },
      usedDurationFallback: false,
    };
  }
}

export async function resolveDurationForTrack(
  absolutePath: string,
  relativePath: string,
  fsTimeoutMs: number,
): Promise<number | null> {
  const result = await readTrackMetadata(absolutePath, relativePath, {
    fsTimeoutMs,
    durationMode: 'full_fallback',
  });
  return result.metadata.durationMs;
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) {
    return [];
  }
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await fn(items[index]!, index);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}
