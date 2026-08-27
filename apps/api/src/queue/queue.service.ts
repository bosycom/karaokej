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
      .prepare(`SELECT id FROM tracks WHERE id = ?`)
      .get(trackId) as { id: number } | undefined;
    if (!track) {
      throw new NotFoundException('Track not found');
    }
    const max = this.db.raw
      .prepare(`SELECT COALESCE(MAX(position), 0) AS n FROM queue_items`)
      .get() as { n: number };
    this.db.raw
      .prepare(
        `INSERT INTO queue_items (track_id, position, added_at) VALUES (?, ?, ?)`,
      )
      .run(trackId, max.n + 1, Date.now());

    const playback = this.db.raw
      .prepare(`SELECT current_queue_item_id, status FROM playback_state WHERE id = 1`)
      .get() as { current_queue_item_id: number | null; status: string };
    if (!playback.current_queue_item_id) {
      const first = this.db.raw
        .prepare(`SELECT id FROM queue_items ORDER BY position ASC, id ASC LIMIT 1`)
        .get() as { id: number } | undefined;
      if (first) {
        this.db.raw
          .prepare(
            `UPDATE playback_state SET current_queue_item_id = ?, status = CASE WHEN status = 'idle' THEN 'paused' ELSE status END, position_ms = 0, seek_seq = seek_seq + 1, updated_at = ? WHERE id = 1`,
          )
          .run(first.id, Date.now());
      }
    }

    this.session.broadcast();
    return this.list();
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
