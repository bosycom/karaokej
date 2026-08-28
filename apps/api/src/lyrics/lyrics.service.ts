import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { LyricsDto, TrackDto } from '@karaokej/shared';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { AppConfigService } from '../config/app-config.service';
import { DbService } from '../db/db.service';
import { TrackRow, trackToDto } from '../db/types';
import { lyricPathFor, yieldEventLoop } from '../library/fs-utils';
import { LibraryService } from '../library/library.service';
import { SessionService } from '../session/session.service';
import { LrclibClient } from './lrclib.client';
import { parseLrc } from './lrc-parser';

const NOT_FOUND_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class LyricsService {
  private readonly logger = new Logger(LyricsService.name);
  private fetchRunning = false;
  private fetchCancelRequested = false;

  constructor(
    private readonly db: DbService,
    private readonly config: AppConfigService,
    private readonly library: LibraryService,
    private readonly session: SessionService,
    private readonly lrclib: LrclibClient,
  ) {}

  getParsed(trackId: number): LyricsDto {
    const track = this.library.getTrack(trackId);
    if (!track) {
      return { available: false, lines: [] };
    }
    const absolute = this.config.resolveUnderLibrary(track.relative_path);
    if (!absolute) {
      return { available: false, lines: [] };
    }
    const lrcPath = lyricPathFor(absolute);
    if (!existsSync(lrcPath)) {
      return { available: false, lines: [] };
    }
    try {
      const content = readFileSync(lrcPath, 'utf8');
      const lines = parseLrc(content);
      if (lines.length === 0) {
        return { available: false, lines: [] };
      }
      return { available: true, lines };
    } catch (err) {
      this.logger.warn(
        `Failed reading LRC for track ${trackId}: ${err instanceof Error ? err.message : err}`,
      );
      return { available: false, lines: [] };
    }
  }

  async startFetch(): Promise<void> {
    if (this.fetchRunning) {
      return;
    }
    this.fetchCancelRequested = false;
    this.fetchRunning = true;
    void this.runFetch().finally(() => {
      this.fetchRunning = false;
    });
  }

  cancelFetch(): void {
    if (!this.fetchRunning) {
      return;
    }
    this.fetchCancelRequested = true;
  }

  async fetchTrack(trackId: number): Promise<TrackDto> {
    const track = this.library.getTrack(trackId);
    if (!track) {
      throw new NotFoundException('Track not found');
    }
    await this.fetchOne(track);
    this.session.broadcast();
    const updated = this.library.getTrack(trackId);
    if (!updated) {
      throw new NotFoundException('Track not found');
    }
    return trackToDto(updated);
  }

  private async runFetch(): Promise<void> {
    const candidates = this.db.raw
      .prepare(
        `SELECT * FROM tracks
         WHERE available = 1
           AND (lyric_status IN ('missing', 'error')
            OR (lyric_status = 'not_found' AND (lyric_checked_at IS NULL OR lyric_checked_at < ?)))
         ORDER BY artist COLLATE NOCASE, title COLLATE NOCASE`,
      )
      .all(Date.now() - NOT_FOUND_COOLDOWN_MS) as TrackRow[];

    this.library.setJob('lyrics', {
      running: true,
      current: 0,
      total: candidates.length,
      message:
        candidates.length === 0
          ? 'No tracks need lyrics'
          : `Fetching lyrics for ${candidates.length} tracks`,
    });

    if (candidates.length === 0) {
      this.library.setJob('lyrics', { running: false });
      return;
    }

    let processed = 0;
    for (const track of candidates) {
      if (this.fetchCancelRequested) {
        this.library.setJob('lyrics', {
          running: false,
          current: processed,
          total: candidates.length,
          message: 'Lyric fetch cancelled',
        });
        return;
      }
      await this.fetchOne(track);
      processed += 1;
      this.library.setJob('lyrics', {
        running: true,
        current: processed,
        total: candidates.length,
        message: `${track.artist ?? 'Unknown'} — ${track.title}`,
      });
      await yieldEventLoop();
      await this.lrclib.waitForSpacing();
    }

    this.library.setJob('lyrics', {
      running: false,
      current: candidates.length,
      total: candidates.length,
      message: 'Lyric fetch complete',
    });
  }

  async fetchOne(track: TrackRow): Promise<void> {
    const absolute = this.config.resolveUnderLibrary(track.relative_path);
    if (!absolute) {
      this.updateLyricState(track.id, 'error', null, null);
      return;
    }
    const lrcPath = lyricPathFor(absolute);
    if (existsSync(lrcPath)) {
      this.updateLyricState(track.id, 'present', 'local', track.lrclib_id);
      return;
    }
    if (!track.title || !track.artist) {
      this.updateLyricState(track.id, 'missing', null, null);
      return;
    }

    try {
      const record = await this.lrclib.getBest({
        trackName: track.title,
        artistName: track.artist,
        albumName: track.album,
        durationSec: track.duration_ms ? track.duration_ms / 1000 : null,
      });

      if (!record) {
        this.updateLyricState(track.id, 'not_found', null, null);
        this.remember(track);
        return;
      }

      if (record.instrumental) {
        this.updateLyricState(track.id, 'instrumental', 'lrclib', record.id);
        this.remember(track, 'instrumental', 'lrclib', record.id);
        return;
      }

      const synced = record.syncedLyrics?.trim();
      if (!synced) {
        this.updateLyricState(track.id, 'not_found', 'lrclib', record.id);
        this.remember(track);
        return;
      }

      const lines = parseLrc(synced);
      if (lines.length === 0) {
        this.updateLyricState(track.id, 'error', 'lrclib', record.id);
        return;
      }

      writeFileSync(lrcPath, synced.endsWith('\n') ? synced : synced + '\n', 'utf8');
      this.updateLyricState(track.id, 'present', 'lrclib', record.id);
      this.remember(track, 'present', 'lrclib', record.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`LRCLIB failed for ${track.artist} - ${track.title}: ${message}`);
      this.updateLyricState(track.id, 'error', null, null);
    }
  }

  private updateLyricState(
    trackId: number,
    status: string,
    source: string | null,
    lrclibId: number | null,
  ): void {
    this.db.raw
      .prepare(
        `UPDATE tracks
         SET lyric_status = ?, lyric_source = ?, lyric_checked_at = ?, lrclib_id = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(status, source, Date.now(), lrclibId, Date.now(), trackId);
  }

  private remember(
    track: TrackRow,
    status?: string,
    source?: string | null,
    lrclibId?: number | null,
  ): void {
    if (!track.fingerprint) {
      return;
    }
    this.db.raw
      .prepare(
        `INSERT INTO lyric_memory (fingerprint, lyric_status, lyric_source, lyric_checked_at, lrclib_id)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(fingerprint) DO UPDATE SET
           lyric_status = excluded.lyric_status,
           lyric_source = excluded.lyric_source,
           lyric_checked_at = excluded.lyric_checked_at,
           lrclib_id = excluded.lrclib_id`,
      )
      .run(
        track.fingerprint,
        status ?? 'not_found',
        source ?? null,
        Date.now(),
        lrclibId ?? null,
      );
  }
}
