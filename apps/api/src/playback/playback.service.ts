import { Injectable, NotFoundException } from '@nestjs/common';
import { PlaybackStateDto } from '@karaokej/shared';
import { DbService } from '../db/db.service';
import { QueueService } from '../queue/queue.service';
import { SessionService } from '../session/session.service';
import { SettingsService } from '../settings/settings.service';

@Injectable()
export class PlaybackService {
  constructor(
    private readonly db: DbService,
    private readonly session: SessionService,
    private readonly queue: QueueService,
    private readonly settings: SettingsService,
  ) {}

  get(): PlaybackStateDto {
    return this.session.getPlayback();
  }

  play(): PlaybackStateDto {
    const state = this.ensureCurrent();
    this.db.raw
      .prepare(
        `UPDATE playback_state SET status = 'playing', updated_at = ? WHERE id = 1`,
      )
      .run(Date.now());
    this.session.broadcast();
    return this.get();
  }

  pause(): PlaybackStateDto {
    this.db.raw
      .prepare(
        `UPDATE playback_state SET status = 'paused', updated_at = ? WHERE id = 1`,
      )
      .run(Date.now());
    this.session.broadcast();
    return this.get();
  }

  seek(positionMs: number): PlaybackStateDto {
    const clamped = Math.max(0, Math.floor(positionMs));
    this.db.raw
      .prepare(
        `UPDATE playback_state SET position_ms = ?, seek_seq = seek_seq + 1, updated_at = ? WHERE id = 1`,
      )
      .run(clamped, Date.now());
    this.session.broadcast();
    return this.get();
  }

  volume(volume: number): PlaybackStateDto {
    const clamped = Math.min(1, Math.max(0, volume));
    this.db.raw
      .prepare(
        `UPDATE playback_state SET volume = ?, updated_at = ? WHERE id = 1`,
      )
      .run(clamped, Date.now());
    this.session.broadcast();
    return this.get();
  }

  checkpoint(positionMs: number, clientId?: string): PlaybackStateDto {
    const playback = this.db.raw
      .prepare(`SELECT player_client_id, status FROM playback_state WHERE id = 1`)
      .get() as { player_client_id: string | null; status: string };
    if (clientId && playback.player_client_id && playback.player_client_id !== clientId) {
      return this.get();
    }
    this.db.raw
      .prepare(
        `UPDATE playback_state SET position_ms = ?, updated_at = ? WHERE id = 1`,
      )
      .run(Math.max(0, Math.floor(positionMs)), Date.now());
    return this.get();
  }

  skip(): PlaybackStateDto {
    const row = this.db.raw
      .prepare(`SELECT current_queue_item_id FROM playback_state WHERE id = 1`)
      .get() as { current_queue_item_id: number | null };
    if (!row.current_queue_item_id) {
      this.ensureCurrent();
      this.session.broadcast();
      return this.get();
    }
    const next = this.queue.nextItemAfter(row.current_queue_item_id);
    this.setCurrent(next?.id ?? null, next ? 'playing' : 'idle');
    this.session.broadcast();
    return this.get();
  }

  ended(clientId?: string): PlaybackStateDto {
    const playback = this.db.raw
      .prepare(`SELECT player_client_id FROM playback_state WHERE id = 1`)
      .get() as { player_client_id: string | null };
    if (clientId && playback.player_client_id && playback.player_client_id !== clientId) {
      return this.get();
    }
    const row = this.db.raw
      .prepare(`SELECT current_queue_item_id FROM playback_state WHERE id = 1`)
      .get() as { current_queue_item_id: number | null };
    if (
      this.settings.isRemovePlayedFromQueueEnabled() &&
      row.current_queue_item_id
    ) {
      this.queue.remove(row.current_queue_item_id);
      return this.get();
    }
    return this.skip();
  }

  playQueueItem(queueItemId: number): PlaybackStateDto {
    const item = this.db.raw
      .prepare(`SELECT id FROM queue_items WHERE id = ?`)
      .get(queueItemId) as { id: number } | undefined;
    if (!item) {
      throw new NotFoundException('Queue item not found');
    }
    this.setCurrent(item.id, 'playing');
    this.session.broadcast();
    return this.get();
  }

  claimPlayer(clientId: string): PlaybackStateDto {
    this.session.claimPlayer(clientId);
    return this.get();
  }

  private ensureCurrent(): PlaybackStateDto {
    const row = this.db.raw
      .prepare(`SELECT current_queue_item_id FROM playback_state WHERE id = 1`)
      .get() as { current_queue_item_id: number | null };
    if (row.current_queue_item_id) {
      const stillThere = this.db.raw
        .prepare(`SELECT id FROM queue_items WHERE id = ?`)
        .get(row.current_queue_item_id);
      if (stillThere) {
        return this.get();
      }
    }
    const first = this.db.raw
      .prepare(`SELECT id FROM queue_items ORDER BY position ASC, id ASC LIMIT 1`)
      .get() as { id: number } | undefined;
    this.setCurrent(first?.id ?? null, first ? 'paused' : 'idle');
    return this.get();
  }

  private setCurrent(
    queueItemId: number | null,
    status: 'idle' | 'playing' | 'paused',
  ): void {
    this.db.raw
      .prepare(
        `UPDATE playback_state
         SET current_queue_item_id = ?, status = ?, position_ms = 0, seek_seq = seek_seq + 1, updated_at = ?
         WHERE id = 1`,
      )
      .run(queueItemId, status, Date.now());
  }
}
