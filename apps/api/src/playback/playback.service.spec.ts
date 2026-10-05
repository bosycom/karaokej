import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlaybackService } from './playback.service';
import { QueueService } from '../queue/queue.service';
import { createMockSession } from '../test/mock-session';
import { createTestDb, insertTrack, TestDbService } from '../test/test-db';

function setLoop(db: TestDbService, enabled: boolean): void {
  db.raw
    .prepare(`UPDATE playback_state SET loop_queue = ? WHERE id = 1`)
    .run(enabled ? 1 : 0);
}

function setCurrent(db: TestDbService, queueItemId: number | null, status = 'playing'): void {
  db.raw
    .prepare(
      `UPDATE playback_state SET current_queue_item_id = ?, status = ?, position_ms = 0 WHERE id = 1`,
    )
    .run(queueItemId, status);
}

describe('PlaybackService loop', () => {
  let db: TestDbService;
  let cleanup: () => void;
  let playback: PlaybackService;
  let queue: QueueService;
  let trackA: number;
  let trackB: number;

  beforeEach(() => {
    ({ db, cleanup } = createTestDb());
    const session = createMockSession(db);
    const settings = {
      isRemovePlayedFromQueueEnabled: vi.fn(() => false),
    };
    const separation = { ensureScheduledForCurrentQueue: vi.fn() };
    playback = new PlaybackService(
      db as never,
      session,
      {} as QueueService,
      settings as never,
      separation as never,
    );
    queue = new QueueService(db as never, session, playback as never);
    Object.assign(playback, { queue });
    trackA = insertTrack(db, {
      relativePath: 'a/song-a.mp3',
      title: 'Song A',
      artist: 'Artist A',
    });
    trackB = insertTrack(db, {
      relativePath: 'b/song-b.mp3',
      title: 'Song B',
      artist: 'Artist B',
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('restarts the only queue item when loop is on and skip reaches the end', () => {
    queue.add(trackA);
    const items = queue.list();
    setCurrent(db, items[0]!.id);
    setLoop(db, true);

    playback.skip();

    const state = playback.get();
    expect(state.currentQueueItemId).toBe(items[0]!.id);
    expect(state.status).toBe('playing');
    expect(state.seekSeq).toBeGreaterThan(0);
  });

  it('reshuffles and plays the first item when loop is on and skip leaves the last item', () => {
    queue.add(trackA);
    queue.add(trackB);
    const items = queue.list();
    setCurrent(db, items[1]!.id);
    setLoop(db, true);

    playback.skip();

    const state = playback.get();
    expect([items[0]!.id, items[1]!.id]).toContain(state.currentQueueItemId);
    expect(state.status).toBe('playing');
  });

  it('persists loop toggle on playback state', () => {
    playback.setLoopQueue(true);
    expect(playback.get().loopQueue).toBe(true);
    playback.setLoopQueue(false);
    expect(playback.get().loopQueue).toBe(false);
  });
});
