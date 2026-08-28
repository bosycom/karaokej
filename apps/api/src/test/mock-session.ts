import { vi } from 'vitest';
import { QueueItemDto } from '@karaokej/shared';
import { SessionService } from '../session/session.service';
import { TestDbService } from './test-db';
import { TrackRow, trackToDto } from '../db/types';

export function createMockSession(db: TestDbService): SessionService {
  return {
    broadcast: vi.fn(),
    getQueue(): QueueItemDto[] {
      const rows = db.raw
        .prepare(
          `SELECT
             q.id AS queue_id,
             q.position AS queue_position,
             q.added_at,
             t.*
           FROM queue_items q
           JOIN tracks t ON t.id = q.track_id
           ORDER BY q.position ASC, q.id ASC`,
        )
        .all() as Array<
        TrackRow & { queue_id: number; queue_position: number; added_at: number }
      >;
      return rows.map((row) => ({
        id: row.queue_id,
        position: row.queue_position,
        addedAt: new Date(row.added_at).toISOString(),
        track: trackToDto(row),
        stem: null,
      }));
    },
  } as unknown as SessionService;
}
