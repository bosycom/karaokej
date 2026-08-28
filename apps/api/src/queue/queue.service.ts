import { Injectable, NotFoundException } from '@nestjs/common';
import { QueueItemDto } from '@karaokej/shared';
import { DbService } from '../db/db.service';
import { SessionService } from '../session/session.service';

@Injectable()
export class QueueService {
  constructor(
    private readonly db: DbService,
    private readonly session: SessionService,
  ) {}

  list(): QueueItemDto[] {
    return this.session.getQueue();
  }

  add(trackId: number): QueueItemDto[] {
    const track = this.db.raw
      .prepare(`SELECT id FROM tracks WHERE id = ? AND available = 1`)
      .get(trackId) as { id: number } | undefined;
    if (!track) {
      throw new NotFoundException('Track not found');
    }
    return this.insertTracks([trackId], false);
  }

  appendTracks(trackIds: number[], startPlaying: boolean): QueueItemDto[] {
    if (trackIds.length === 0) {
      return this.list();
    }
    const validated = this.validateAvailableTrackIds(trackIds);
    if (validated.length === 0) {
      return this.list();
    }
    const hadCurrent = this.hasCurrentQueueItem();
    this.insertTracksAtEnd(validated);
    if (startPlaying && !hadCurrent) {
      this.selectFirstQueueItem('playing');
    }
    this.session.broadcast();
    return this.list();
  }

  replaceWithTracks(trackIds: number[], startPlaying: boolean): QueueItemDto[] {
    const validated = this.validateAvailableTrackIds(trackIds);
    const tx = this.db.raw.transaction(() => {
      this.db.raw.prepare(`DELETE FROM queue_items`).run();
      if (validated.length > 0) {
        this.insertTracksAtEnd(validated, 0);
      }
      if (validated.length > 0 && startPlaying) {
        const first = this.db.raw
          .prepare(
            `SELECT id FROM queue_items ORDER BY position ASC, id ASC LIMIT 1`,
          )
          .get() as { id: number };
        this.db.raw
          .prepare(
            `UPDATE playback_state SET current_queue_item_id = ?, status = 'playing', position_ms = 0, seek_seq = seek_seq + 1, updated_at = ? WHERE id = 1`,
          )
          .run(first.id, Date.now());
      } else {
        this.db.raw
          .prepare(
            `UPDATE playback_state SET current_queue_item_id = NULL, status = 'idle', position_ms = 0, seek_seq = seek_seq + 1, updated_at = ? WHERE id = 1`,
          )
          .run(Date.now());
      }
    });
    tx();
    this.session.broadcast();
    return this.list();
  }

  private insertTracks(trackIds: number[], startPlaying: boolean): QueueItemDto[] {
    this.insertTracksAtEnd(trackIds);
    if (startPlaying || !this.hasCurrentQueueItem()) {
      this.selectFirstQueueItem(startPlaying ? 'playing' : 'paused');
    }
    this.session.broadcast();
    return this.list();
  }

  private insertTracksAtEnd(trackIds: number[], positionOffset?: number): void {
    const max = this.db.raw
      .prepare(`SELECT COALESCE(MAX(position), 0) AS n FROM queue_items`)
      .get() as { n: number };
    let position = positionOffset ?? max.n;
    const insert = this.db.raw.prepare(
      `INSERT INTO queue_items (track_id, position, added_at) VALUES (?, ?, ?)`,
    );
    const now = Date.now();
    for (const trackId of trackIds) {
      position += 1;
      insert.run(trackId, position, now);
    }
  }

  private validateAvailableTrackIds(trackIds: number[]): number[] {
    const stmt = this.db.raw.prepare(
      `SELECT id FROM tracks WHERE id = ? AND available = 1`,
    );
    return trackIds.filter((id) => Boolean(stmt.get(id)));
  }

  private hasCurrentQueueItem(): boolean {
    const playback = this.db.raw
      .prepare(`SELECT current_queue_item_id FROM playback_state WHERE id = 1`)
      .get() as { current_queue_item_id: number | null };
    if (!playback.current_queue_item_id) {
      return false;
    }
    return Boolean(
      this.db.raw
        .prepare(`SELECT id FROM queue_items WHERE id = ?`)
        .get(playback.current_queue_item_id),
    );
  }

  private selectFirstQueueItem(
    status: 'idle' | 'playing' | 'paused',
  ): void {
    const first = this.db.raw
      .prepare(`SELECT id FROM queue_items ORDER BY position ASC, id ASC LIMIT 1`)
      .get() as { id: number } | undefined;
    this.db.raw
      .prepare(
        `UPDATE playback_state SET current_queue_item_id = ?, status = ?, position_ms = 0, seek_seq = seek_seq + 1, updated_at = ? WHERE id = 1`,
      )
      .run(first?.id ?? null, first ? status : 'idle', Date.now());
  }

  remove(id: number): QueueItemDto[] {
    const current = this.db.raw
      .prepare(`SELECT current_queue_item_id FROM playback_state WHERE id = 1`)
      .get() as { current_queue_item_id: number | null };

    if (current.current_queue_item_id === id) {
      const next = this.nextItemAfter(id);
      this.db.raw
        .prepare(
          `UPDATE playback_state SET current_queue_item_id = ?, position_ms = 0, seek_seq = seek_seq + 1, status = CASE WHEN ? IS NULL THEN 'idle' ELSE status END, updated_at = ? WHERE id = 1`,
        )
        .run(next?.id ?? null, next?.id ?? null, Date.now());
    }

    this.db.raw.prepare(`DELETE FROM queue_items WHERE id = ?`).run(id);
    this.reindex();
    this.session.broadcast();
    return this.list();
  }

  reorder(ids: number[]): QueueItemDto[] {
    const existing = this.db.raw
      .prepare(`SELECT id FROM queue_items ORDER BY position ASC, id ASC`)
      .all() as Array<{ id: number }>;
    const existingSet = new Set(existing.map((r) => r.id));
    if (ids.length !== existing.length || ids.some((id) => !existingSet.has(id))) {
      throw new NotFoundException('Queue reorder payload does not match current queue');
    }
    const update = this.db.raw.prepare(
      `UPDATE queue_items SET position = ? WHERE id = ?`,
    );
    const tx = this.db.raw.transaction(() => {
      ids.forEach((id, index) => update.run(index + 1, id));
    });
    tx();
    this.session.broadcast();
    return this.list();
  }

  move(id: number, direction: 'up' | 'down'): QueueItemDto[] {
    const items = this.db.raw
      .prepare(`SELECT id, position FROM queue_items ORDER BY position ASC, id ASC`)
      .all() as Array<{ id: number; position: number }>;
    const index = items.findIndex((item) => item.id === id);
    if (index < 0) {
      throw new NotFoundException('Queue item not found');
    }
    const swapWith = direction === 'up' ? index - 1 : index + 1;
    if (swapWith < 0 || swapWith >= items.length) {
      return this.list();
    }
    const a = items[index];
    const b = items[swapWith];
    const update = this.db.raw.prepare(
      `UPDATE queue_items SET position = ? WHERE id = ?`,
    );
    const tx = this.db.raw.transaction(() => {
      update.run(b.position, a.id);
      update.run(a.position, b.id);
    });
    tx();
    this.session.broadcast();
    return this.list();
  }

  nextItemAfter(queueItemId: number): { id: number } | undefined {
    return this.db.raw
      .prepare(
        `SELECT id FROM queue_items
         WHERE position > (SELECT position FROM queue_items WHERE id = ?)
         ORDER BY position ASC, id ASC LIMIT 1`,
      )
      .get(queueItemId) as { id: number } | undefined;
  }

  private reindex(): void {
    const items = this.db.raw
      .prepare(`SELECT id FROM queue_items ORDER BY position ASC, id ASC`)
      .all() as Array<{ id: number }>;
    const update = this.db.raw.prepare(
      `UPDATE queue_items SET position = ? WHERE id = ?`,
    );
    const tx = this.db.raw.transaction(() => {
      items.forEach((item, index) => update.run(index + 1, item.id));
    });
    tx();
  }
}
