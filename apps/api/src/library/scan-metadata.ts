import { basename, extname } from 'node:path';
import { fallbackMetadata } from './fs-utils';
import { withFsOp } from './fs-timeout';
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

export async function readTrackMetadata(
  absolutePath: string,
  relativePath: string,
  fsTimeoutMs: number,
): Promise<ParsedTrackMetadata> {
  const stem = basename(absolutePath, extname(absolutePath));
  const fallback = fallbackMetadata(relativePath, stem);
  try {
    const { parseFile } = await import('music-metadata');
    const meta = await withFsOp(`parse ${relativePath}`, fsTimeoutMs, () =>
      parseFile(absolutePath, { duration: true, skipCovers: true }),
    );
    const common = meta.common;
    const title = common.title?.trim() || fallback.title;
    const artist =
      common.artist?.trim() ||
      common.albumartist?.trim() ||
      fallback.artist;
    const album = common.album?.trim() || fallback.album;
    const albumArtist = common.albumartist?.trim() || null;
    const trackNo = common.track?.no ?? null;
    const durationMs = meta.format.duration
      ? Math.round(meta.format.duration * 1000)
      : null;
    return {
      title,
      artist,
      album,
      albumArtist,
      trackNo,
      durationMs,
      rating: ratingFromMetadata(meta),
      year: yearFromMetadata(common),
      genres: genresFromMetadata(common),
    };
  } catch {
    return {
      ...fallback,
      albumArtist: null,
      trackNo: null,
      durationMs: null,
      rating: 0,
      year: null,
      genres: [],
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
