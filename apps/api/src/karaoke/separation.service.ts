import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  forwardRef,
} from '@nestjs/common';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  rmSync,
  statSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync } from 'node:fs';
import { KaraokeStemDto, isKaraokeMode } from '@karaokej/shared';
import { AppConfigService } from '../config/app-config.service';
import { DbService } from '../db/db.service';
import { JobRow, KaraokeStemRow, TrackRow, karaokeStemToDto } from '../db/types';
import { QueueService } from '../queue/queue.service';
import { SessionService } from '../session/session.service';
import { SETTING_KARAOKE_MODE } from './karaoke.service';
import {
  buildDemucsArgs,
  parseDemucsProgress,
  resolveStemOutputPath,
  spawnDemucs,
} from './demucs-cli';

@Injectable()
export class SeparationService implements OnModuleInit {
  private readonly logger = new Logger(SeparationService.name);
  private readonly queue: number[] = [];
  private readonly queued = new Set<number>();
  private workerRunning = false;
  private cancelRequested = false;
  private activeChild: { kill: (signal?: NodeJS.Signals) => boolean } | null =
    null;
  private processingTrackId: number | null = null;
  private spawnFn: typeof spawnDemucs = spawnDemucs;

  /** Track id currently being separated, if any. */
  getProcessingTrackId(): number | null {
    return this.processingTrackId;
  }

  constructor(
    private readonly db: DbService,
    private readonly config: AppConfigService,
    @Inject(forwardRef(() => SessionService))
    private readonly session: SessionService,
    @Inject(forwardRef(() => QueueService))
    private readonly queueService: QueueService,
  ) {}

  /** Test hook */
  setSpawnFn(fn: typeof spawnDemucs): void {
    this.spawnFn = fn;
  }

  onModuleInit(): void {
    this.recoverStuckRows();
    if (!this.config.isDemucsAvailable()) {
      this.markAllUnsupported();
    }
  }

  isAvailable(): boolean {
    return this.config.isDemucsAvailable();
  }

  request(trackId: number): void {
    if (!this.isAvailable()) {
      this.upsertStem(trackId, { status: 'unsupported' });
      return;
    }
    this.ensureTrackExists(trackId);
    const track = this.getTrackRow(trackId);
    const existing = this.getStemRow(trackId);
    if (existing && this.isStemFresh(existing, track) && existing.status === 'ready') {
      return;
    }
    if (existing && this.isStemFresh(existing, track) && existing.status === 'pending') {
      this.enqueue(trackId);
      return;
    }
    if (existing && this.isStemFresh(existing, track) && existing.status === 'processing') {
      return;
    }
    this.upsertStem(trackId, {
      status: 'pending',
      model: this.config.demucsModel,
      source_mtime_ms: track.mtime_ms,
      source_size_bytes: track.size_bytes,
      error: null,
      requested_at: Date.now(),
    });
    this.enqueue(trackId);
  }

  ensureScheduledForCurrentQueue(): void {
    if (!this.isAvailable()) {
      return;
    }
    const mode = this.getKaraokeMode();
    if (mode !== 'ai') {
      return;
    }
    const currentTrackId = this.getCurrentTrackId();
    if (currentTrackId != null) {
      this.request(currentTrackId);
    }
    const nextTrackId = this.getNextQueueTrackId();
    if (nextTrackId != null && nextTrackId !== currentTrackId) {
      this.request(nextTrackId);
    }
  }

  cancel(): void {
    this.cancelRequested = true;
    this.queue.length = 0;
    this.queued.clear();
    try {
      this.activeChild?.kill('SIGTERM');
    } catch {
      /* ignore */
    }
    this.setJob('separation', {
      running: false,
      message: 'Separation cancelled',
      trackId: null,
    });
  }

  getStemDto(trackId: number): KaraokeStemDto {
    const track = this.getTrackRow(trackId);
    let row = this.getStemRow(trackId);
    if (row && row.status === 'ready' && !this.isStemFresh(row, track)) {
      this.invalidateStem(trackId);
      row = this.getStemRow(trackId);
    }
    if (
      row &&
      (row.status === 'pending' || row.status === 'processing') &&
      !this.isStemFresh(row, track)
    ) {
      this.invalidateStem(trackId);
      row = this.getStemRow(trackId);
    }
    return karaokeStemToDto(trackId, row ?? null);
  }

  getStemFilePath(trackId: number): string {
    const row = this.getStemRow(trackId);
    if (!row || row.status !== 'ready' || !row.file_path) {
      throw new NotFoundException('Instrumental stem is not ready');
    }
    const track = this.getTrackRow(trackId);
    if (!this.isStemFresh(row, track)) {
      throw new NotFoundException('Instrumental stem is stale');
    }
    if (!existsSync(row.file_path)) {
      throw new NotFoundException('Instrumental stem file is missing');
    }
    return row.file_path;
  }

  remove(trackId: number): void {
    this.ensureTrackExists(trackId);
    const row = this.getStemRow(trackId);
    if (!row) {
      throw new NotFoundException('No AI stem for this track');
    }
    this.deleteStemFiles(trackId, row);
    this.db.raw.prepare(`DELETE FROM karaoke_stems WHERE track_id = ?`).run(trackId);
  }

  private enqueue(trackId: number): void {
    if (this.queued.has(trackId)) {
      return;
    }
    this.queue.push(trackId);
    this.queued.add(trackId);
    void this.pump();
  }

  private async pump(): Promise<void> {
    if (this.workerRunning) {
      return;
    }
    this.workerRunning = true;
    try {
      while (this.queue.length > 0 && !this.cancelRequested) {
        const trackId = this.queue.shift();
        if (trackId == null) {
          break;
        }
        this.queued.delete(trackId);
        await this.processOne(trackId);
      }
    } finally {
      this.workerRunning = false;
      if (this.queue.length > 0 && !this.cancelRequested) {
        void this.pump();
      } else if (!this.activeChild) {
        this.setJob('separation', {
          running: false,
          message: this.cancelRequested ? 'Separation cancelled' : null,
          trackId: null,
        });
        this.cancelRequested = false;
      }
    }
  }

  private async processOne(trackId: number): Promise<void> {
    const executable = this.config.resolveDemucsExecutable();
    if (!executable) {
      this.upsertStem(trackId, { status: 'unsupported', error: 'demucs not found' });
      return;
    }

    const track = this.getTrackRow(trackId);
    const absolute = this.config.resolveUnderLibrary(track.relative_path);
    if (!absolute || !existsSync(absolute)) {
      this.upsertStem(trackId, {
        status: 'failed',
        error: 'Source audio file is missing',
      });
      return;
    }

    const now = Date.now();
    this.upsertStem(trackId, {
      status: 'processing',
      model: this.config.demucsModel,
      source_mtime_ms: track.mtime_ms,
      source_size_bytes: track.size_bytes,
      error: null,
      requested_at: now,
    });
    this.processingTrackId = trackId;
    this.setJob('separation', {
      running: true,
      current: 0,
      total: 100,
      message: `Separating ${track.title}…`,
      trackId,
    });

    const tempDir = mkdtempSync(join(tmpdir(), 'karaokej-demucs-'));
    const args = buildDemucsArgs({
      model: this.config.demucsModel,
      inputPath: absolute,
      outputDir: tempDir,
      extraArgs: this.config.demucsExtraArgs,
    });

    let lastPercent = 0;
    try {
      const result = await this.spawnFn({
        executable,
        args,
        timeoutMs: this.config.demucsTimeoutMs,
        onChild: (child) => {
          this.activeChild = child;
        },
        onStderr: (chunk) => {
          const percent = parseDemucsProgress(chunk);
          if (percent != null && percent !== lastPercent) {
            lastPercent = percent;
            this.setJob('separation', {
              running: true,
              current: percent,
              total: 100,
              message: `Separating ${track.title} (${percent}%)…`,
              trackId,
            });
          }
        },
      });

      if (this.cancelRequested) {
        return;
      }

      if (result.code !== 0) {
        throw new Error(`demucs exited with code ${result.code ?? 'unknown'}`);
      }

      const produced = resolveStemOutputPath(
        tempDir,
        this.config.demucsModel,
        absolute,
      );
      if (!existsSync(produced)) {
        throw new Error('demucs did not produce an instrumental stem');
      }

      mkdirSync(this.config.stemCachePath, { recursive: true });
      const cached = join(this.config.stemCachePath, `${trackId}.mp3`);
      copyFileSync(produced, cached);
      const size = statSync(cached).size;
      const processedAt = Date.now();
      this.upsertStem(trackId, {
        status: 'ready',
        model: this.config.demucsModel,
        model_version: this.config.demucsModel,
        file_path: cached,
        size_bytes: size,
        source_mtime_ms: track.mtime_ms,
        source_size_bytes: track.size_bytes,
        error: null,
        processed_at: processedAt,
      });
      this.setJob('separation', {
        running: false,
        current: 100,
        total: 100,
        message: `Instrumental ready for ${track.title}`,
        trackId: null,
      });
    } catch (err) {
      if (!this.cancelRequested) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Separation failed for track ${trackId}: ${message}`);
        this.upsertStem(trackId, {
          status: 'failed',
          error: message,
        });
        this.setJob('separation', {
          running: false,
          message: `Separation failed: ${message}`,
          trackId: null,
        });
      }
    } finally {
      this.activeChild = null;
      this.processingTrackId = null;
      try {
        rmSync(tempDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  }

  private setJob(
    kind: 'separation',
    patch: {
      running?: boolean;
      current?: number;
      total?: number;
      message?: string | null;
      trackId?: number | null;
    },
  ): void {
    if (patch.trackId !== undefined) {
      this.processingTrackId = patch.trackId;
    }
    const row = this.db.raw
      .prepare(`SELECT * FROM jobs WHERE kind = ?`)
      .get(kind) as JobRow | undefined;
    const current = {
      running: Boolean(row?.running),
      current: row?.current ?? 0,
      total: row?.total ?? 0,
      message: row?.message ?? null,
    };
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

  private recoverStuckRows(): void {
    const rows = this.db.raw
      .prepare(`SELECT track_id FROM karaoke_stems WHERE status = 'processing'`)
      .all() as Array<{ track_id: number }>;
    for (const row of rows) {
      this.upsertStem(row.track_id, { status: 'pending', error: null });
      this.enqueue(row.track_id);
    }
  }

  private markAllUnsupported(): void {
    /* no-op: unsupported is per-request when demucs missing */
  }

  private invalidateStem(trackId: number): void {
    this.deleteStemFiles(trackId, this.getStemRow(trackId));
    this.db.raw.prepare(`DELETE FROM karaoke_stems WHERE track_id = ?`).run(trackId);
    this.request(trackId);
  }

  private deleteStemFiles(trackId: number, row: KaraokeStemRow | undefined): void {
    const paths = new Set<string>();
    if (row?.file_path) {
      paths.add(row.file_path);
    }
    paths.add(join(this.config.stemCachePath, `${trackId}.mp3`));
    for (const filePath of paths) {
      if (existsSync(filePath)) {
        try {
          rmSync(filePath, { force: true });
        } catch {
          /* ignore */
        }
      }
    }
  }

  private isStemFresh(row: KaraokeStemRow, track: TrackRow): boolean {
    return (
      row.source_mtime_ms === track.mtime_ms &&
      row.source_size_bytes === track.size_bytes
    );
  }

  private upsertStem(
    trackId: number,
    patch: Partial<{
      status: KaraokeStemRow['status'];
      model: string | null;
      model_version: string | null;
      file_path: string | null;
      size_bytes: number | null;
      source_mtime_ms: number;
      source_size_bytes: number;
      error: string | null;
      requested_at: number | null;
      processed_at: number | null;
    }>,
  ): void {
    const now = Date.now();
    const existing = this.getStemRow(trackId);
    if (!existing) {
      this.db.raw
        .prepare(
          `INSERT INTO karaoke_stems (
             track_id, status, model, model_version, file_path, size_bytes,
             source_mtime_ms, source_size_bytes, error, requested_at, processed_at,
             created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          trackId,
          patch.status ?? 'pending',
          patch.model ?? this.config.demucsModel,
          patch.model_version ?? null,
          patch.file_path ?? null,
          patch.size_bytes ?? null,
          patch.source_mtime_ms ?? 0,
          patch.source_size_bytes ?? 0,
          patch.error ?? null,
          patch.requested_at ?? now,
          patch.processed_at ?? null,
          now,
          now,
        );
      return;
    }
    this.db.raw
      .prepare(
        `UPDATE karaoke_stems SET
           status = COALESCE(?, status),
           model = COALESCE(?, model),
           model_version = COALESCE(?, model_version),
           file_path = COALESCE(?, file_path),
           size_bytes = COALESCE(?, size_bytes),
           source_mtime_ms = COALESCE(?, source_mtime_ms),
           source_size_bytes = COALESCE(?, source_size_bytes),
           error = ?,
           requested_at = COALESCE(?, requested_at),
           processed_at = COALESCE(?, processed_at),
           updated_at = ?
         WHERE track_id = ?`,
      )
      .run(
        patch.status ?? null,
        patch.model ?? null,
        patch.model_version ?? null,
        patch.file_path ?? null,
        patch.size_bytes ?? null,
        patch.source_mtime_ms ?? null,
        patch.source_size_bytes ?? null,
        patch.error === undefined ? existing.error : patch.error,
        patch.requested_at ?? null,
        patch.processed_at ?? null,
        now,
        trackId,
      );
  }

  private getStemRow(trackId: number): KaraokeStemRow | undefined {
    return this.db.raw
      .prepare(`SELECT * FROM karaoke_stems WHERE track_id = ?`)
      .get(trackId) as KaraokeStemRow | undefined;
  }

  private getTrackRow(trackId: number): TrackRow {
    const row = this.db.raw
      .prepare(`SELECT * FROM tracks WHERE id = ?`)
      .get(trackId) as TrackRow | undefined;
    if (!row) {
      throw new NotFoundException('Track not found');
    }
    return row;
  }

  private ensureTrackExists(trackId: number): void {
    this.getTrackRow(trackId);
  }

  private getKaraokeMode(): string {
    const row = this.db.raw
      .prepare(`SELECT value FROM app_settings WHERE key = ?`)
      .get(SETTING_KARAOKE_MODE) as { value: string } | undefined;
    const value = row?.value ?? 'off';
    return isKaraokeMode(value) ? value : 'off';
  }

  private getCurrentTrackId(): number | null {
    const row = this.db.raw
      .prepare(`SELECT current_queue_item_id FROM playback_state WHERE id = 1`)
      .get() as { current_queue_item_id: number | null };
    if (!row.current_queue_item_id) {
      return null;
    }
    const joined = this.db.raw
      .prepare(
        `SELECT t.id FROM queue_items q JOIN tracks t ON t.id = q.track_id WHERE q.id = ?`,
      )
      .get(row.current_queue_item_id) as { id: number } | undefined;
    return joined?.id ?? null;
  }

  private getNextQueueTrackId(): number | null {
    const currentQueueItemId = (
      this.db.raw
        .prepare(`SELECT current_queue_item_id FROM playback_state WHERE id = 1`)
        .get() as { current_queue_item_id: number | null }
    ).current_queue_item_id;
    if (!currentQueueItemId) {
      return null;
    }
    const next = this.queueService.nextItemAfter(currentQueueItemId);
    if (!next) {
      return null;
    }
    const joined = this.db.raw
      .prepare(`SELECT track_id FROM queue_items WHERE id = ?`)
      .get(next.id) as { track_id: number } | undefined;
    return joined?.track_id ?? null;
  }
}
