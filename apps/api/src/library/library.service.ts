import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { existsSync } from 'node:fs';
import { basename, extname } from 'node:path';
import {
  JobStatusDto,
  LibraryStatusDto,
  TrackPageDto,
} from '@karaokej/shared';
import { AppConfigService } from '../config/app-config.service';
import { DbService } from '../db/db.service';
import { JobRow, TrackRow, trackToDto } from '../db/types';
import { SessionService } from '../session/session.service';
import {
  fallbackMetadata,
  lyricPathFor,
  makeFingerprint,
  walkAudioFiles,
  yieldEventLoop,
} from './fs-utils';
import { ratingFromMetadata, readRatingFromFile } from '../rating/rating-tags';
import {
  detectRootChange,
  hasPathRebaseConflicts,
  planPathRebase,
} from './scan-root';

const LIBRARY_SCAN_ROOT_KEY = 'library_scan_root';

@Injectable()
export class LibraryService {
  private readonly logger = new Logger(LibraryService.name);
  private scanRunning = false;
  private scanCancelRequested = false;

  constructor(
    private readonly db: DbService,
    private readonly config: AppConfigService,
    private readonly session: SessionService,
  ) {}

  status(): LibraryStatusDto {
    const trackCount = this.db.raw
      .prepare(`SELECT COUNT(*) AS n FROM tracks`)
      .get() as { n: number };
    const withLyrics = this.db.raw
      .prepare(`SELECT COUNT(*) AS n FROM tracks WHERE lyric_status = 'present'`)
      .get() as { n: number };
    return {
      trackCount: trackCount.n,
      withLyrics: withLyrics.n,
      libraryPath: this.config.libraryPath,
      libraryConfigured: Boolean(this.config.libraryPath),
      scan: this.jobStatus('scan'),
      lyricsFetch: this.jobStatus('lyrics'),
    };
  }

  jobStatus(kind: 'scan' | 'lyrics'): JobStatusDto {
    const row = this.db.raw
      .prepare(`SELECT * FROM jobs WHERE kind = ?`)
      .get(kind) as JobRow | undefined;
    return {
      kind,
      running: Boolean(row?.running),
      current: row?.current ?? 0,
      total: row?.total ?? 0,
      message: row?.message ?? null,
    };
  }

  setJob(
    kind: 'scan' | 'lyrics',
    patch: {
      running?: boolean;
      current?: number;
      total?: number;
      message?: string | null;
    },
  ): void {
    const current = this.jobStatus(kind);
    this.db.raw
      .prepare(
        `UPDATE jobs SET running = ?, current = ?, total = ?, message = ?, updated_at = ? WHERE kind = ?`,
      )
      .run(
        Number(patch.running ?? current.running),
        patch.current ?? current.current,
        patch.total ?? current.total,
        patch.message === undefined ? current.message : patch.message,
        Date.now(),
        kind,
      );
    this.session.broadcast();
  }

  getTrack(id: number): TrackRow | undefined {
    return this.db.raw
      .prepare(`SELECT * FROM tracks WHERE id = ?`)
      .get(id) as TrackRow | undefined;
  }

  search(
    q: string,
    page: number,
    limit: number,
    minRating?: number,
  ): TrackPageDto {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(100, Math.max(1, limit));
    const offset = (safePage - 1) * safeLimit;
    const query = q.trim();
    const rating = this.normalizeMinRating(minRating);
    const ratingSql = rating == null ? '' : ' AND rating >= ?';
    const ratingParams = rating == null ? [] : [rating];

    if (!query) {
      const total = (
        this.db.raw
          .prepare(`SELECT COUNT(*) AS n FROM tracks WHERE 1=1${ratingSql}`)
          .get(...ratingParams) as { n: number }
      ).n;
      const rows = this.db.raw
        .prepare(
          `SELECT * FROM tracks WHERE 1=1${ratingSql}
           ORDER BY artist COLLATE NOCASE, album COLLATE NOCASE, track_no, title COLLATE NOCASE
           LIMIT ? OFFSET ?`,
        )
        .all(...ratingParams, safeLimit, offset) as TrackRow[];
      return {
        items: rows.map(trackToDto),
        total,
        page: safePage,
        limit: safeLimit,
      };
    }

    const match = this.toFtsQuery(query);
    let total = 0;
    let rows: TrackRow[] = [];
    try {
      total = (
        this.db.raw
          .prepare(
            `SELECT COUNT(*) AS n FROM tracks t
             JOIN tracks_fts f ON f.rowid = t.id
             WHERE tracks_fts MATCH ?${ratingSql}`,
          )
          .get(match, ...ratingParams) as { n: number }
      ).n;
      rows = this.db.raw
        .prepare(
          `SELECT t.* FROM tracks t
           JOIN tracks_fts f ON f.rowid = t.id
           WHERE tracks_fts MATCH ?${ratingSql}
           ORDER BY rank, t.artist COLLATE NOCASE, t.title COLLATE NOCASE
           LIMIT ? OFFSET ?`,
        )
        .all(match, ...ratingParams, safeLimit, offset) as TrackRow[];
    } catch (err) {
      this.logger.warn(`FTS query failed, falling back to LIKE: ${err}`);
      const like = `%${query.replaceAll('%', '\\%')}%`;
      const likeWhere = `(title LIKE ? ESCAPE '\\' OR artist LIKE ? ESCAPE '\\' OR album LIKE ? ESCAPE '\\')${ratingSql}`;
      total = (
        this.db.raw
          .prepare(`SELECT COUNT(*) AS n FROM tracks WHERE ${likeWhere}`)
          .get(like, like, like, ...ratingParams) as { n: number }
      ).n;
      rows = this.db.raw
        .prepare(
          `SELECT * FROM tracks
           WHERE ${likeWhere}
           ORDER BY artist COLLATE NOCASE, title COLLATE NOCASE
           LIMIT ? OFFSET ?`,
        )
        .all(like, like, like, ...ratingParams, safeLimit, offset) as TrackRow[];
    }

    return {
      items: rows.map(trackToDto),
      total,
      page: safePage,
      limit: safeLimit,
    };
  }

  async startScan(): Promise<void> {
    if (!this.config.libraryPath) {
      throw new BadRequestException(
        'MUSIC_LIBRARY_PATH is not configured. Set it in .env and restart.',
      );
    }
    if (this.scanRunning) {
      return;
    }
    this.scanCancelRequested = false;
    this.scanRunning = true;
    void this.runScan().finally(() => {
      this.scanRunning = false;
    });
  }

  cancelScan(): void {
    if (!this.scanRunning) {
      return;
    }
    this.scanCancelRequested = true;
  }

  private async runScan(): Promise<void> {
    const root = this.config.libraryPath!;
    this.setJob('scan', {
      running: true,
      current: 0,
      total: 0,
      message: 'Walking library…',
    });
    try {
      this.maybeRebaseCataloguePaths(root);
      if (this.scanCancelRequested) {
        this.setJob('scan', {
          running: false,
          message: 'Scan cancelled',
        });
        return;
      }
      const files = await walkAudioFiles(root, () => this.scanCancelRequested);
      if (this.scanCancelRequested) {
        this.setJob('scan', {
          running: false,
          message: 'Scan cancelled',
        });
        return;
      }
      this.setJob('scan', {
        running: true,
        current: 0,
        total: files.length,
        message: `Found ${files.length} audio files`,
      });

      const existing = this.db.raw
        .prepare(`SELECT id, relative_path, size_bytes, mtime_ms FROM tracks`)
        .all() as Array<{
        id: number;
        relative_path: string;
        size_bytes: number;
        mtime_ms: number;
      }>;
      const byPath = new Map(existing.map((row) => [row.relative_path, row]));
      const seen = new Set<string>();

      let processed = 0;
      for (const file of files) {
        if (this.scanCancelRequested) {
          this.setJob('scan', {
            running: false,
            current: processed,
            total: files.length,
            message: 'Scan cancelled',
          });
          return;
        }
        seen.add(file.relativePath);
        const prev = byPath.get(file.relativePath);
        const changed =
          !prev ||
          prev.size_bytes !== file.sizeBytes ||
          prev.mtime_ms !== file.mtimeMs;

        if (changed) {
          await this.upsertFile(file);
        } else {
          this.refreshLyricPresence(file.relativePath, file.absolutePath);
          await this.refreshRatingCache(file.relativePath, file.absolutePath);
        }

        processed += 1;
        if (processed % 25 === 0) {
          this.setJob('scan', {
            running: true,
            current: processed,
            total: files.length,
            message: `Indexing ${processed} / ${files.length}`,
          });
          await yieldEventLoop();
        }
      }

      const staleIds = existing
        .filter((row) => !seen.has(row.relative_path))
        .map((row) => row.id);
      if (staleIds.length > 0) {
        const deleteOne = this.db.raw.prepare(
          `DELETE FROM tracks WHERE id = ?`,
        );
        const stash = this.db.raw.prepare(
          `INSERT INTO lyric_memory (fingerprint, lyric_status, lyric_source, lyric_checked_at, lrclib_id)
           SELECT fingerprint, lyric_status, lyric_source, lyric_checked_at, lrclib_id
           FROM tracks WHERE id = ? AND fingerprint IS NOT NULL
           ON CONFLICT(fingerprint) DO UPDATE SET
             lyric_status = excluded.lyric_status,
             lyric_source = excluded.lyric_source,
             lyric_checked_at = excluded.lyric_checked_at,
             lrclib_id = excluded.lrclib_id`,
        );
        const tx = this.db.raw.transaction((ids: number[]) => {
          for (const id of ids) {
            stash.run(id);
            deleteOne.run(id);
          }
        });
        tx(staleIds);
      }

      this.setStoredScanRoot(root);

      this.setJob('scan', {
        running: false,
        current: files.length,
        total: files.length,
        message: `Indexed ${files.length} tracks`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Scan failed: ${message}`);
      this.setJob('scan', {
        running: false,
        message: `Scan failed: ${message}`,
      });
    }
  }

  private refreshLyricPresence(relativePath: string, absolutePath: string): void {
    const hasLrc = existsSync(lyricPathFor(absolutePath));
    const row = this.db.raw
      .prepare(`SELECT id, lyric_status FROM tracks WHERE relative_path = ?`)
      .get(relativePath) as { id: number; lyric_status: string } | undefined;
    if (!row) {
      return;
    }
    if (hasLrc && row.lyric_status !== 'present') {
      this.db.raw
        .prepare(
          `UPDATE tracks SET lyric_status = 'present', lyric_source = COALESCE(lyric_source, 'local'), updated_at = ? WHERE id = ?`,
        )
        .run(Date.now(), row.id);
    } else if (!hasLrc && row.lyric_status === 'present') {
      this.db.raw
        .prepare(
          `UPDATE tracks SET lyric_status = 'missing', lyric_source = NULL, updated_at = ? WHERE id = ?`,
        )
        .run(Date.now(), row.id);
    }
  }

  private async upsertFile(file: {
    absolutePath: string;
    relativePath: string;
    sizeBytes: number;
    mtimeMs: number;
    format: string;
  }): Promise<void> {
    const now = Date.now();
    const parsed = await this.readMetadata(file.absolutePath, file.relativePath);
    const fingerprint = makeFingerprint(
      parsed.artist,
      parsed.title,
      file.sizeBytes,
      parsed.durationMs,
    );
    const hasLrc = existsSync(lyricPathFor(file.absolutePath));
    const memory = this.db.raw
      .prepare(`SELECT * FROM lyric_memory WHERE fingerprint = ?`)
      .get(fingerprint) as
      | {
          lyric_status: string;
          lyric_source: string | null;
          lyric_checked_at: number | null;
          lrclib_id: number | null;
        }
      | undefined;

    let lyricStatus = hasLrc ? 'present' : 'missing';
    let lyricSource: string | null = hasLrc ? 'local' : null;
    let lyricCheckedAt: number | null = null;
    let lrclibId: number | null = null;
    if (!hasLrc && memory) {
      lyricStatus = memory.lyric_status === 'present' ? 'missing' : memory.lyric_status;
      lyricSource = memory.lyric_source;
      lyricCheckedAt = memory.lyric_checked_at;
      lrclibId = memory.lrclib_id;
    }

    this.db.raw
      .prepare(
        `INSERT INTO tracks (
           relative_path, format, size_bytes, mtime_ms, title, artist, album, album_artist,
           track_no, duration_ms, lyric_status, lyric_source, lyric_checked_at, lrclib_id,
           fingerprint, rating, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
           updated_at = excluded.updated_at`,
      )
      .run(
        file.relativePath,
        file.format,
        file.sizeBytes,
        file.mtimeMs,
        parsed.title,
        parsed.artist,
        parsed.album,
        parsed.albumArtist,
        parsed.trackNo,
        parsed.durationMs,
        lyricStatus,
        lyricSource,
        lyricCheckedAt,
        lrclibId,
        fingerprint,
        parsed.rating,
        now,
        now,
      );
  }

  private async readMetadata(
    absolutePath: string,
    relativePath: string,
  ): Promise<{
    title: string;
    artist: string | null;
    album: string | null;
    albumArtist: string | null;
    trackNo: number | null;
    durationMs: number | null;
    rating: number;
  }> {
    const stem = basename(absolutePath, extname(absolutePath));
    const fallback = fallbackMetadata(relativePath, stem);
    try {
      const { parseFile } = await import('music-metadata');
      const meta = await parseFile(absolutePath, { duration: true, skipCovers: true });
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
      };
    } catch (err) {
      this.logger.warn(
        `Metadata read failed for ${relativePath}: ${err instanceof Error ? err.message : err}`,
      );
      return {
        ...fallback,
        albumArtist: null,
        trackNo: null,
        durationMs: null,
        rating: 0,
      };
    }
  }

  private async refreshRatingCache(
    relativePath: string,
    absolutePath: string,
  ): Promise<void> {
    try {
      const rating = await readRatingFromFile(absolutePath);
      const row = this.db.raw
        .prepare(`SELECT rating FROM tracks WHERE relative_path = ?`)
        .get(relativePath) as { rating: number | null } | undefined;
      if (!row || row.rating === rating) {
        return;
      }
      this.db.raw
        .prepare(
          `UPDATE tracks SET rating = ?, updated_at = ? WHERE relative_path = ?`,
        )
        .run(rating, Date.now(), relativePath);
    } catch (err) {
      this.logger.warn(
        `Rating read failed for ${relativePath}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  private getStoredScanRoot(): string | null {
    const row = this.db.raw
      .prepare(`SELECT value FROM app_settings WHERE key = ?`)
      .get(LIBRARY_SCAN_ROOT_KEY) as { value: string } | undefined;
    return row?.value ?? null;
  }

  private setStoredScanRoot(root: string): void {
    this.db.raw
      .prepare(
        `INSERT INTO app_settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run(LIBRARY_SCAN_ROOT_KEY, root);
  }

  private maybeRebaseCataloguePaths(newRoot: string): void {
    const storedRoot = this.getStoredScanRoot();
    const change = detectRootChange(storedRoot, newRoot);

    if (change.kind === 'unknown') {
      const trackCount = (
        this.db.raw.prepare(`SELECT COUNT(*) AS n FROM tracks`).get() as {
          n: number;
        }
      ).n;
      if (trackCount > 0) {
        this.setStoredScanRoot(newRoot);
        this.logger.log(
          `Recorded library scan root for existing catalogue: ${newRoot}`,
        );
      }
      return;
    }

    if (change.kind === 'same') {
      return;
    }

    if (change.kind === 'unrelated') {
      this.logger.warn(
        `Library path changed to an unrelated folder (${storedRoot} -> ${newRoot}); catalogue paths will not be rebased`,
      );
      return;
    }

    this.setJob('scan', {
      running: true,
      current: 0,
      total: 0,
      message: 'Rebasing catalogue paths…',
    });

    const rows = this.db.raw
      .prepare(`SELECT id, relative_path FROM tracks`)
      .all() as Array<{ id: number; relative_path: string }>;

    const plan = planPathRebase(rows, change);
    if (!plan || hasPathRebaseConflicts(rows, plan)) {
      this.logger.warn(
        `Could not rebase catalogue paths for root change (${storedRoot} -> ${newRoot}); falling back to full re-index`,
      );
      return;
    }

    const update = this.db.raw.prepare(
      `UPDATE tracks SET relative_path = ?, updated_at = ? WHERE id = ?`,
    );
    const now = Date.now();
    const tx = this.db.raw.transaction((updates: typeof plan.updates) => {
      for (const row of updates) {
        update.run(row.relative_path, now, row.id);
      }
      this.setStoredScanRoot(newRoot);
    });
    tx(plan.updates);

    this.logger.log(
      `Rebased ${plan.updates.length} catalogue path(s) for root change (${storedRoot} -> ${newRoot})`,
    );
  }

  private normalizeMinRating(minRating?: number): number | null {
    if (minRating == null || !Number.isFinite(minRating)) {
      return null;
    }
    const n = Math.floor(minRating);
    if (n < 1 || n > 10) {
      return null;
    }
    return n;
  }

  private toFtsQuery(raw: string): string {
    const tokens = raw
      .replace(/["*']/g, ' ')
      .split(/\s+/)
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 12);
    if (tokens.length === 0) {
      return '""';
    }
    return tokens.map((t) => `"${t}"*`).join(' AND ');
  }
}
