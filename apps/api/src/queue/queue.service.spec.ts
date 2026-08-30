import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueueItemDto } from '@karaokej/shared';
import { QueueService } from './queue.service';
import { createMockSession } from '../test/mock-session';
import { createTestDb, insertTrack, TestDbService } from '../test/test-db';

function queueItemIds(queue: QueueItemDto[]): number[] {
  return queue.map((item) => item.id);
}

function setCurrentQueueItem(db: TestDbService, queueItemId: number | null): void {
  db.raw
    .prepare(`UPDATE playback_state SET current_queue_item_id = ? WHERE id = 1`)
    .run(queueItemId);
}

describe('QueueService.shuffle', () => {
  let db: TestDbService;
  let cleanup: () => void;
  let queue: QueueService;
  let trackA: number;
  let trackB: number;
  let trackC: number;
  let trackD: number;
  let trackE: number;

  beforeEach(() => {
    ({ db, cleanup } = createTestDb());
    const session = createMockSession(db);
    queue = new QueueService(db as never, session);
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
    trackC = insertTrack(db, {
      relativePath: 'c/song-c.mp3',
      title: 'Song C',
      artist: 'Artist C',
    });
    trackD = insertTrack(db, {
      relativePath: 'd/song-d.mp3',
      title: 'Song D',
      artist: 'Artist D',
    });
    trackE = insertTrack(db, {
      relativePath: 'e/song-e.mp3',
      title: 'Song E',
      artist: 'Artist E',
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('shuffles the entire queue when no current item is selected', () => {
    queue.add(trackA);
    queue.add(trackB);
    queue.add(trackC);
    queue.add(trackD);
    const before = queue.list();
    const beforeIds = queueItemIds(before);

    vi.spyOn(Math, 'random').mockReturnValue(0);

    const after = queue.shuffle();
    const afterIds = queueItemIds(after);

    expect(afterIds).toHaveLength(beforeIds.length);
    expect(new Set(afterIds)).toEqual(new Set(beforeIds));
    expect(afterIds).not.toEqual(beforeIds);
  });

  it('keeps the current item and earlier songs in place while shuffling upcoming songs', () => {
    queue.add(trackA);
    queue.add(trackB);
    queue.add(trackC);
    queue.add(trackD);
    queue.add(trackE);
    const before = queue.list();
    const current = before[2]!;
    setCurrentQueueItem(db, current.id);
    const prefixIds = queueItemIds(before.slice(0, 3));
    const suffixIds = queueItemIds(before.slice(3));

    vi.spyOn(Math, 'random').mockReturnValue(0);

    const after = queue.shuffle();
    const afterIds = queueItemIds(after);

    expect(afterIds.slice(0, 3)).toEqual(prefixIds);
    expect(new Set(afterIds.slice(3))).toEqual(new Set(suffixIds));
    expect(afterIds.slice(3)).not.toEqual(suffixIds);
  });

  it('does not change order when the current item is last', () => {
    queue.add(trackA);
    queue.add(trackB);
    queue.add(trackC);
    const before = queue.list();
    const current = before.at(-1)!;
    setCurrentQueueItem(db, current.id);

    const after = queue.shuffle();

    expect(queueItemIds(after)).toEqual(queueItemIds(before));
  });

  it('does not change order when only one upcoming song remains', () => {
    queue.add(trackA);
    queue.add(trackB);
    const before = queue.list();
    setCurrentQueueItem(db, before[0]!.id);

    const after = queue.shuffle();

    expect(queueItemIds(after)).toEqual(queueItemIds(before));
  });

  it('does not change a single-item queue', () => {
    queue.add(trackA);
    const before = queue.list();

    const after = queue.shuffle();

    expect(queueItemIds(after)).toEqual(queueItemIds(before));
  });

  it('shuffles the entire queue when the current item id is stale', () => {
    queue.add(trackA);
    queue.add(trackB);
    queue.add(trackC);
    const before = queue.list();
    const staleId = before[0]!.id;
    setCurrentQueueItem(db, staleId);
    db.raw.exec('PRAGMA foreign_keys = OFF');
    db.raw.prepare(`DELETE FROM queue_items WHERE id = ?`).run(staleId);
    db.raw.exec('PRAGMA foreign_keys = ON');
    const remainingBefore = queue.list();

    vi.spyOn(Math, 'random').mockReturnValue(0);

    const after = queue.shuffle();

    expect(new Set(queueItemIds(after))).toEqual(new Set(queueItemIds(remainingBefore)));
    expect(queueItemIds(after)).not.toEqual(queueItemIds(remainingBefore));
  });
});

describe('QueueService.add placement', () => {
  let db: TestDbService;
  let cleanup: () => void;
  let queue: QueueService;
  let trackA: number;
  let trackB: number;
  let trackC: number;
  let trackD: number;
  let trackNew: number;

  beforeEach(() => {
    ({ db, cleanup } = createTestDb());
    const session = createMockSession(db);
    queue = new QueueService(db as never, session);
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
    trackC = insertTrack(db, {
      relativePath: 'c/song-c.mp3',
      title: 'Song C',
      artist: 'Artist C',
    });
    trackD = insertTrack(db, {
      relativePath: 'd/song-d.mp3',
      title: 'Song D',
      artist: 'Artist D',
    });
    trackNew = insertTrack(db, {
      relativePath: 'new/song-new.mp3',
      title: 'Song New',
      artist: 'Artist New',
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('inserts after the current item when placement is after_current', () => {
    queue.add(trackA);
    queue.add(trackB);
    queue.add(trackC);
    const before = queue.list();
    const current = before[1]!;
    setCurrentQueueItem(db, current.id);

    const after = queue.add(trackNew, 'after_current');
    const afterTrackIds = after.map((item) => item.track.id);

    expect(afterTrackIds).toEqual([
      trackA,
      trackB,
      trackNew,
      trackC,
    ]);
  });

  it('appends at end when current item is last and placement is after_current', () => {
    queue.add(trackA);
    queue.add(trackB);
    const before = queue.list();
    const current = before.at(-1)!;
    setCurrentQueueItem(db, current.id);

    const after = queue.add(trackNew, 'after_current');
    const afterTrackIds = after.map((item) => item.track.id);

    expect(afterTrackIds).toEqual([trackA, trackB, trackNew]);
  });

  it('falls back to append at end when no current item is selected', () => {
    queue.add(trackA);
    queue.add(trackB);
    setCurrentQueueItem(db, null);

    const after = queue.add(trackNew, 'after_current');
    const afterTrackIds = after.map((item) => item.track.id);

    expect(afterTrackIds).toEqual([trackA, trackB, trackNew]);
  });

  it('appends at end by default when placement is end', () => {
    queue.add(trackA);
    queue.add(trackB);
    const before = queue.list();
    setCurrentQueueItem(db, before[0]!.id);

    const after = queue.add(trackNew, 'end');
    const afterTrackIds = after.map((item) => item.track.id);

    expect(afterTrackIds).toEqual([trackA, trackB, trackNew]);
  });
});
