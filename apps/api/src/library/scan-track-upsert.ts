import { basename, extname } from 'node:path';
import { fallbackMetadata, makeFingerprint } from './fs-utils';
import { sanitizeDurationMs } from './duration-utils';
import type { ParsedTrackMetadata, ScanChunkItem } from './scan-ipc';

interface DbLike {
  prepare(sql: string): {
    run(...params: unknown[]): unknown;
    get(...params: unknown[]): unknown;
  };
}

function lyricStateForFingerprint(
  db: DbLike,
  fingerprint: string,
  hasLrc: boolean,
): {
  lyricStatus: string;
  lyricSource: string | null;
  lyricCheckedAt: number | null;
  lrclibId: number | null;
} {
  let lyricStatus = hasLrc ? 'present' : 'missing';
  let lyricSource: string | null = hasLrc ? 'local' : null;
  let lyricCheckedAt: number | null = null;
  let lrclibId: number | null = null;
  const memory = db
    .prepare(`SELECT * FROM lyric_memory WHERE fingerprint = ?`)
    .get(fingerprint) as
    | {
        lyric_status: string;
        lyric_source: string | null;
        lyric_checked_at: number | null;
        lrclib_id: number | null;
      }
    | undefined;
  if (!hasLrc && memory) {
    lyricStatus =
      memory.lyric_status === 'present' ? 'missing' : memory.lyric_status;
    lyricSource = memory.lyric_source;
    lyricCheckedAt = memory.lyric_checked_at;
    lrclibId = memory.lrclib_id;
  }
  return { lyricStatus, lyricSource, lyricCheckedAt, lrclibId };
}

export function upsertPathTrack(
  db: DbLike,
  item: ScanChunkItem,
  now: number,
): void {
  const stem = basename(item.absolutePath, extname(item.absolutePath));
  const fallback = fallbackMetadata(item.relativePath, stem);
  const fingerprint = makeFingerprint(
    fallback.artist,
    fallback.title,
    item.sizeBytes,
    null,
  );
  const hasLrc = item.hasLrc ?? false;
  const { lyricStatus, lyricSource, lyricCheckedAt, lrclibId } =
    lyricStateForFingerprint(db, fingerprint, hasLrc);

  db.prepare(
    `INSERT INTO tracks (
       relative_path, format, size_bytes, mtime_ms, title, artist, album, album_artist,
       track_no, duration_ms, lyric_status, lyric_source, lyric_checked_at, lrclib_id,
       fingerprint, rating, year, genres, metadata_status, available, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?, ?, ?, ?, NULL, NULL, NULL, 'pending', 1, ?, ?)
     ON CONFLICT(relative_path) DO UPDATE SET
       format = excluded.format,
       size_bytes = excluded.size_bytes,
       mtime_ms = excluded.mtime_ms,
       title = excluded.title,
       artist = excluded.artist,
       album = excluded.album,
       album_artist = NULL,
       track_no = NULL,
       duration_ms = NULL,
       lyric_status = excluded.lyric_status,
       lyric_source = excluded.lyric_source,
       lyric_checked_at = excluded.lyric_checked_at,
       lrclib_id = excluded.lrclib_id,
       fingerprint = excluded.fingerprint,
       rating = NULL,
       year = NULL,
       genres = NULL,
       metadata_status = 'pending',
       available = 1,
       updated_at = excluded.updated_at`,
  ).run(
    item.relativePath,
    item.format,
    item.sizeBytes,
    item.mtimeMs,
    fallback.title,
    fallback.artist,
    fallback.album,
    lyricStatus,
    lyricSource,
    lyricCheckedAt,
    lrclibId,
    fingerprint,
    now,
    now,
  );
}

export function upsertTagsTrack(
  db: DbLike,
  item: Pick<
    ScanChunkItem,
    'relativePath' | 'format' | 'sizeBytes' | 'mtimeMs' | 'hasLrc'
  >,
  parsed: ParsedTrackMetadata,
  now: number,
): void {
  const durationMs = sanitizeDurationMs(parsed.durationMs);
  const fingerprint = makeFingerprint(
    parsed.artist,
    parsed.title,
    item.sizeBytes,
    durationMs,
  );
  const hasLrc = item.hasLrc ?? false;
  const { lyricStatus, lyricSource, lyricCheckedAt, lrclibId } =
    lyricStateForFingerprint(db, fingerprint, hasLrc);

  db.prepare(
    `INSERT INTO tracks (
       relative_path, format, size_bytes, mtime_ms, title, artist, album, album_artist,
       track_no, duration_ms, lyric_status, lyric_source, lyric_checked_at, lrclib_id,
       fingerprint, rating, year, genres, metadata_status, available, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ready', 1, ?, ?)
     ON CONFLICT(relative_path) DO UPDATE SET
       format = excluded.format,
       size_bytes = excluded.size_bytes,
       mtime_ms = excluded.mtime_ms,
       title = excluded.title,
       artist = excluded.artist,
       album = excluded.album,
       album_artist = excluded.album_artist,
       track_no = excluded.track_no,
       duration_ms = excluded.duration_ms,
       lyric_status = excluded.lyric_status,
       lyric_source = excluded.lyric_source,
       lyric_checked_at = excluded.lyric_checked_at,
       lrclib_id = excluded.lrclib_id,
       fingerprint = excluded.fingerprint,
       rating = excluded.rating,
       year = excluded.year,
       genres = excluded.genres,
       metadata_status = 'ready',
       available = 1,
       updated_at = excluded.updated_at`,
  ).run(
    item.relativePath,
    item.format,
    item.sizeBytes,
    item.mtimeMs,
    parsed.title,
    parsed.artist,
    parsed.album,
    parsed.albumArtist,
    parsed.trackNo,
    durationMs,
    lyricStatus,
    lyricSource,
    lyricCheckedAt,
    lrclibId,
    fingerprint,
    parsed.rating,
    parsed.year,
    parsed.genres.length > 0 ? JSON.stringify(parsed.genres) : null,
    now,
    now,
  );
}
