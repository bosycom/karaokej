import { vi } from 'vitest';
import { QueueItemDto } from '@karaokej/shared';
import { SessionService } from '../session/session.service';
import { TestDbService } from './test-db';
import { PlaybackRow, TrackRow, trackToDto } from '../db/types';

export function createMockSession(db: TestDbService): SessionService {
  return {
    broadcast: vi.fn(),
    getPlayback() {
      const row = db.raw
        .prepare(`SELECT * FROM playback_state WHERE id = 1`)
        .get() as PlaybackRow;
      let currentTrack = null;
      if (row.current_queue_item_id) {
        const joined = db.raw
          .prepare(
            `SELECT t.* FROM queue_items q JOIN tracks t ON t.id = q.track_id WHERE q.id = ?`,
          )
          .get(row.current_queue_item_id) as TrackRow | undefined;
        currentTrack = joined ? trackToDto(joined) : null;
      }
      return {
        currentQueueItemId: row.current_queue_item_id,
        currentTrack,
        status: row.status,
        positionMs: row.position_ms,
        volume: row.volume,
        playerClientId: row.player_client_id,
        seekSeq: row.seek_seq,
        loopQueue: Boolean(row.loop_queue),
      };
    },
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
