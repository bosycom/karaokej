import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { basename, dirname, extname } from 'node:path';
import { AppConfigService } from '../config/app-config.service';
import { DbService } from '../db/db.service';
import {
  CoverGroupRow,
  CoverRow,
  CoverSourceKind,
  TrackRow,
} from '../db/types';
import { LibraryService } from '../library/library.service';
import { yieldEventLoop } from '../library/fs-utils';
import { coverGroupKey } from './cover-group-key';
import { readEmbeddedCover, readSidecarImage } from './cover-source';
import { coverFilePath, pruneUnreferencedCover, writeCoverFile } from './cover-storage';
import {
  COVER_SIZE_KEYS,
  detectCoverFormat,
  renderCoverSize,
  type CoverFormat,
  type CoverSize,
} from './cover-thumbnails';
import { readImageSize } from './image-size';

export interface ResolvedCover {
  status: 'ready' | 'none' | 'error';
  hash: string | null;
  format: CoverFormat;
}

@Injectable()
export class CoverService implements OnModuleInit {
  private readonly logger = new Logger(CoverService.name);
  private readonly inFlight = new Map<string, Promise<ResolvedCover>>();
  private formatPromise: Promise<CoverFormat> | null = null;
  private jobRunning = false;
  private cancelRequested = false;
  private active = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(
    private readonly db: DbService,
    private readonly config: AppConfigService,
    private readonly library: LibraryService,
  ) {}

  /**
   * Catalogues predating cover art have no group key, so backfill once at
   * startup rather than making every track wait for a rescan.
   */
  onModuleInit(): void {
    const pending = this.db.raw
      .prepare(
        `SELECT COUNT(*) AS n FROM tracks
         WHERE available = 1 AND (cover_group IS NULL OR cover_group = '')`,
      )
      .get() as { n: number };
    if (pending.n === 0) {
      return;
    }
    const started = Date.now();
    this.assignMissingGroups();
    this.logger.log(
      `Assigned cover groups to ${pending.n.toLocaleString()} tracks in ${Date.now() - started}ms`,
    );
  }

  format(): Promise<CoverFormat> {
    if (!this.formatPromise) {
      this.formatPromise = detectCoverFormat(
        this.config.ffmpegPath,
        this.config.coverTimeoutMs,
      );
    }
    return this.formatPromise;
  }

  getGroup(groupKey: string): CoverGroupRow | undefined {
    return this.db.raw
      .prepare(`SELECT * FROM cover_groups WHERE group_key = ?`)
      .get(groupKey) as CoverGroupRow | undefined;
  }

  /**
   * Ensures every available track has a group key and every referenced group has
   * a row. Cheap enough to run before each batch job and on demand.
   */
  private assignMissingGroups(): void {
    const missing = this.db.raw
      .prepare(
        `SELECT id, relative_path, album FROM tracks
         WHERE available = 1 AND (cover_group IS NULL OR cover_group = '')`,
      )
      .all() as Array<{ id: number; relative_path: string; album: string | null }>;
    if (missing.length === 0) {
      return;
    }
    const update = this.db.raw.prepare(
      `UPDATE tracks SET cover_group = ? WHERE id = ?`,
    );
    const tx = this.db.raw.transaction(() => {
      for (const row of missing) {
        update.run(coverGroupKey(row.relative_path, row.album), row.id);
      }
    });
    tx();
  }

  syncGroups(): void {
    this.assignMissingGroups();
    this.db.raw.exec(
      `INSERT OR IGNORE INTO cover_groups (group_key, status)
       SELECT DISTINCT cover_group, 'pending' FROM tracks
       WHERE available = 1 AND cover_group IS NOT NULL AND cover_group != ''`,
    );
  }

  /** Recomputes the group for one track after its album tag changed. */
  reassignTrackGroup(trackId: number): void {
    const track = this.db.raw
      .prepare(`SELECT * FROM tracks WHERE id = ?`)
      .get(trackId) as TrackRow | undefined;
    if (!track) {
      return;
    }
    const previous = track.cover_group ?? null;
    const next = coverGroupKey(track.relative_path, track.album);
    if (previous === next) {
      return;
    }
    this.db.raw
      .prepare(`UPDATE tracks SET cover_group = ? WHERE id = ?`)
      .run(next, trackId);
    this.db.raw
      .prepare(`INSERT OR IGNORE INTO cover_groups (group_key, status) VALUES (?, 'pending')`)
      .run(next);
    if (previous) {
      this.pruneGroups([previous]);
    }
  }

  pruneGroups(groupKeys: Iterable<string>): void {
    const cacheRoot = this.config.coverCachePath;
    for (const groupKey of groupKeys) {
      if (!groupKey) {
        continue;
      }
      const inUse = this.db.raw
        .prepare(`SELECT COUNT(*) AS n FROM tracks WHERE cover_group = ?`)
        .get(groupKey) as { n: number };
      if (inUse.n > 0) {
        continue;
      }
      const group = this.getGroup(groupKey);
      this.db.raw
        .prepare(`DELETE FROM cover_groups WHERE group_key = ?`)
        .run(groupKey);
      pruneUnreferencedCover(this.db.raw, cacheRoot, group?.cover_hash ?? null);
    }
  }

  /**
   * Resolves a group's artwork, reusing an in-flight resolution when several
   * requests for the same album arrive together.
   */
  resolveGroup(groupKey: string, force = false): Promise<ResolvedCover> {
    const existing = this.inFlight.get(groupKey);
    if (existing) {
      return existing;
    }
    const pending = this.runResolve(groupKey, force).finally(() => {
      this.inFlight.delete(groupKey);
    });
    this.inFlight.set(groupKey, pending);
    return pending;
  }

  async ensureResolved(groupKey: string): Promise<ResolvedCover> {
    const group = this.getGroup(groupKey);
    const format = await this.format();
    if (group?.status === 'ready' && group.cover_hash) {
      if (this.filesPresent(group.cover_hash, format)) {
        return { status: 'ready', hash: group.cover_hash, format };
      }
      return this.resolveGroup(groupKey, true);
    }
    if (group && (group.status === 'none' || group.status === 'error')) {
      return { status: group.status, hash: null, format };
    }
    return this.resolveGroup(groupKey);
  }

  private filesPresent(hash: string, format: CoverFormat): boolean {
    const cacheRoot = this.config.coverCachePath;
    return COVER_SIZE_KEYS.every((size) =>
      existsSync(coverFilePath(cacheRoot, hash, size, format)),
    );
  }

  coverPath(hash: string, size: CoverSize, format: CoverFormat): string {
    return coverFilePath(this.config.coverCachePath, hash, size, format);
  }

  private representativeTrack(groupKey: string): TrackRow | undefined {
    return this.db.raw
      .prepare(
        `SELECT * FROM tracks
         WHERE cover_group = ? AND available = 1
         ORDER BY COALESCE(track_no, 9999) ASC, relative_path ASC
         LIMIT 1`,
      )
      .get(groupKey) as TrackRow | undefined;
  }

  private async runResolve(
    groupKey: string,
    force: boolean,
  ): Promise<ResolvedCover> {
    const format = await this.format();
    const group = this.getGroup(groupKey);
    if (!force && group?.status === 'ready' && group.cover_hash) {
      if (this.filesPresent(group.cover_hash, format)) {
        return { status: 'ready', hash: group.cover_hash, format };
      }
    }

    const track = this.representativeTrack(groupKey);
    if (!track) {
      this.writeGroup(groupKey, 'none', null, null, null, null);
      return { status: 'none', hash: null, format };
    }

    const absolute = this.config.resolveUnderLibrary(track.relative_path);
    if (!absolute) {
      this.writeGroup(groupKey, 'none', null, null, null, 'Path outside library');
      return { status: 'none', hash: null, format };
    }

    const release = await this.acquire();
    try {
      const source = await this.loadSource(absolute);
      if (!source) {
        this.writeGroup(groupKey, 'none', null, null, null, null);
        return { status: 'none', hash: null, format };
      }

      const hash = createHash('sha256').update(source.data).digest('hex');
      const known = this.db.raw
        .prepare(`SELECT * FROM covers WHERE hash = ?`)
        .get(hash) as CoverRow | undefined;

      if (!known || known.format !== format || !this.filesPresent(hash, format)) {
        await this.generate(hash, source.data, format);
      }

      const previousHash = group?.cover_hash ?? null;
      this.writeGroup(
        groupKey,
        'ready',
        hash,
        source.kind,
        source.path,
        null,
      );
      if (previousHash && previousHash !== hash) {
        pruneUnreferencedCover(this.db.raw, this.config.coverCachePath, previousHash);
      }
      return { status: 'ready', hash, format };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Cover resolution failed for ${groupKey}: ${message}`);
      this.writeGroup(groupKey, 'error', null, null, null, message.slice(0, 300));
      return { status: 'error', hash: null, format };
    } finally {
      release();
    }
  }

  private async loadSource(
    absolute: string,
  ): Promise<{ data: Buffer; kind: CoverSourceKind; path: string } | null> {
    const directory = dirname(absolute);
    const stem = basename(absolute, extname(absolute));
    const sidecar = await readSidecarImage(directory, stem);
    if (sidecar && sidecar.data.length > 0) {
      return { data: sidecar.data, kind: 'sidecar', path: sidecar.path };
    }
    const embedded = await readEmbeddedCover(absolute);
    if (embedded && embedded.length > 0) {
      return { data: embedded, kind: 'embedded', path: absolute };
    }
    return null;
  }

  private async generate(
    hash: string,
    data: Buffer,
    format: CoverFormat,
  ): Promise<void> {
    const cacheRoot = this.config.coverCachePath;
    const options = {
      ffmpegPath: this.config.ffmpegPath,
      timeoutMs: this.config.coverTimeoutMs,
      format,
    };
    const bytes: Partial<Record<CoverSize, number>> = {};
    for (const size of COVER_SIZE_KEYS) {
      const rendered = await renderCoverSize(data, size, options);
      writeCoverFile(cacheRoot, hash, size, format, rendered);
      bytes[size] = rendered.length;
    }
    const dimensions = readImageSize(data);
    this.db.raw
      .prepare(
        `INSERT INTO covers (hash, format, src_width, src_height, bytes_sm, bytes_lg, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(hash) DO UPDATE SET
           format = excluded.format,
           src_width = excluded.src_width,
           src_height = excluded.src_height,
           bytes_sm = excluded.bytes_sm,
           bytes_lg = excluded.bytes_lg`,
      )
      .run(
        hash,
        format,
        dimensions?.width ?? null,
        dimensions?.height ?? null,
        bytes.sm ?? null,
        bytes.lg ?? null,
        Date.now(),
      );
  }

  private writeGroup(
    groupKey: string,
    status: CoverGroupRow['status'],
    hash: string | null,
    kind: CoverSourceKind | null,
    sourcePath: string | null,
    error: string | null,
  ): void {
    this.db.raw
      .prepare(
        `INSERT INTO cover_groups (group_key, status, cover_hash, source_kind, source_path, checked_at, error)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(group_key) DO UPDATE SET
           status = excluded.status,
           cover_hash = excluded.cover_hash,
           source_kind = excluded.source_kind,
           source_path = excluded.source_path,
           checked_at = excluded.checked_at,
           error = excluded.error`,
      )
      .run(groupKey, status, hash, kind, sourcePath, Date.now(), error);
  }

  private acquire(): Promise<() => void> {
    const limit = this.config.coverConcurrency;
    const release = () => {
      this.active -= 1;
      const next = this.waiters.shift();
      if (next) {
        next();
      }
    };
    if (this.active < limit) {
      this.active += 1;
      return Promise.resolve(release);
    }
    return new Promise((resolve) => {
      this.waiters.push(() => {
        this.active += 1;
        resolve(release);
      });
    });
  }

  startBatch(): { started: boolean } {
    if (this.jobRunning) {
      return { started: false };
    }
    this.jobRunning = true;
    this.cancelRequested = false;
    void this.runBatch()
      .catch((err) => {
        this.logger.error(
          `Thumbnail job failed: ${err instanceof Error ? err.message : err}`,
        );
        this.library.setJob('covers', {
          running: false,
          message: 'Thumbnail generation failed',
        });
      })
      .finally(() => {
        this.jobRunning = false;
      });
    return { started: true };
  }

  cancelBatch(): { cancelled: boolean } {
    if (!this.jobRunning) {
      return { cancelled: false };
    }
    this.cancelRequested = true;
    return { cancelled: true };
  }

  private async runBatch(): Promise<void> {
    this.syncGroups();
    const pending = this.db.raw
      .prepare(
        `SELECT group_key FROM cover_groups
         WHERE status IN ('pending', 'error')
         ORDER BY group_key`,
      )
      .all() as Array<{ group_key: string }>;

    this.library.setJob('covers', {
      running: true,
      current: 0,
      total: pending.length,
      message:
        pending.length === 0
          ? 'All thumbnails are up to date'
          : `Creating thumbnails for ${pending.length} albums`,
    });

    if (pending.length === 0) {
      this.library.setJob('covers', { running: false });
      return;
    }

    let processed = 0;
    let created = 0;
    for (const { group_key: groupKey } of pending) {
      if (this.cancelRequested) {
        this.library.setJob('covers', {
          running: false,
          current: processed,
          total: pending.length,
          message: `Thumbnail generation cancelled · ${created} created`,
        });
        return;
      }
      const result = await this.resolveGroup(groupKey);
      if (result.status === 'ready') {
        created += 1;
      }
      processed += 1;
      this.library.setJob('covers', {
        running: true,
        current: processed,
        total: pending.length,
        message: `Creating thumbnails ${processed.toLocaleString()} / ${pending.length.toLocaleString()}`,
      });
      await yieldEventLoop();
    }

    this.library.setJob('covers', {
      running: false,
      current: pending.length,
      total: pending.length,
      message: `Thumbnails ready · ${created.toLocaleString()} of ${pending.length.toLocaleString()} albums have art`,
    });
  }
}
