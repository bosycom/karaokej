import { basename, extname } from 'node:path';
import type { IAudioMetadata } from 'music-metadata';
import { fallbackMetadata } from './fs-utils';
import { withFsOp } from './fs-timeout';
import {
  HEADER_READ_BYTES,
  MIME_BY_EXT,
  readAudioHeaderBuffer,
} from './duration-utils';
import { ratingFromMetadata } from '../rating/rating-tags';
import type { ParsedTrackMetadata } from './scan-ipc';

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

function metadataFromParsed(
  meta: IAudioMetadata,
  relativePath: string,
  stem: string,
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
    durationMs: null,
    rating: ratingFromMetadata(meta),
    year: yearFromMetadata(common),
    genres: genresFromMetadata(common),
    musicbrainzArtistId: musicbrainzArtistIdFromMetadata(common),
  };
}

function musicbrainzArtistIdFromMetadata(common: {
  musicbrainz_artistid?: string[] | null;
}): string | null {
  const raw = common.musicbrainz_artistid?.[0]?.trim();
  return raw || null;
}

export interface ReadTrackMetadataOptions {
  fsTimeoutMs: number;
}

export interface ReadTrackMetadataResult {
  metadata: ParsedTrackMetadata;
}

async function parseTagsFromHeader(
  absolutePath: string,
  fsTimeoutMs: number,
  relativePath: string,
): Promise<IAudioMetadata> {
  const ext = extname(absolutePath).toLowerCase();
  const maxBytes = HEADER_READ_BYTES[ext] ?? 256 * 1024;
  const mimeType = MIME_BY_EXT[ext] ?? 'application/octet-stream';
  const { buffer, fileSize } = await readAudioHeaderBuffer(absolutePath, maxBytes);
  const { parseBuffer } = await import('music-metadata');
  return withFsOp(`parse ${relativePath}`, fsTimeoutMs, () =>
    parseBuffer(
      buffer,
      { mimeType, size: fileSize },
      { duration: false, skipCovers: true },
    ),
  );
}

export async function readTrackMetadata(
  absolutePath: string,
  relativePath: string,
  options: ReadTrackMetadataOptions | number,
): Promise<ReadTrackMetadataResult> {
  const fsTimeoutMs =
    typeof options === 'number' ? options : options.fsTimeoutMs;
  const stem = basename(absolutePath, extname(absolutePath));
  const fallback = fallbackMetadata(relativePath, stem);
  try {
    const meta = await parseTagsFromHeader(
      absolutePath,
      fsTimeoutMs,
      relativePath,
    );
    return {
      metadata: metadataFromParsed(meta, relativePath, stem),
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
        musicbrainzArtistId: null,
      },
    };
  }
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
