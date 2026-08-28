import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { KaraokeService } from './karaoke.service';
import { SeparationService } from './separation.service';
import { createTestDb, insertTrack, TestDbService } from '../test/test-db';
import { KARAOKE_DEFAULTS } from '@karaokej/shared';

function createSeparationStub(db: TestDbService): SeparationService {
  const config = {
    isDemucsAvailable: () => false,
    demucsModel: 'htdemucs',
  };
  const session = { broadcast: () => undefined };
  const queueService = { nextItemAfter: () => null };
  return new SeparationService(
    db as never,
    config as never,
    session as never,
    queueService as never,
  );
}

describe('KaraokeService', () => {
  let db: TestDbService;
  let cleanup: () => void;
  let karaoke: KaraokeService;
  let separation: SeparationService;
  let trackA: number;
  let trackB: number;

  beforeEach(() => {
    ({ db, cleanup } = createTestDb());
    separation = createSeparationStub(db);
    karaoke = new KaraokeService(db as never, separation);
    trackA = insertTrack(db, {
      relativePath: 'a/song-a.mp3',
      title: 'Song A',
    });
    trackB = insertTrack(db, {
      relativePath: 'b/song-b.mp3',
      title: 'Song B',
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('returns defaults for a track without saved settings', () => {
    const settings = karaoke.getSettings(trackA);
    expect(settings.isDefault).toBe(true);
    expect(settings.centerAmount).toBe(KARAOKE_DEFAULTS.centerAmount);
    expect(settings.trackId).toBe(trackA);
  });

  it('throws NotFoundException for missing track', () => {
    expect(() => karaoke.getSettings(9999)).toThrow(NotFoundException);
  });

  it('upserts settings without creating duplicates', () => {
    karaoke.saveSettings(trackA, { centerAmount: 0.6 });
    karaoke.saveSettings(trackA, { centerAmount: 0.7 });
    const count = db.raw
      .prepare(`SELECT COUNT(*) AS n FROM karaoke_settings WHERE track_id = ?`)
      .get(trackA) as { n: number };
    expect(count.n).toBe(1);
    expect(karaoke.getSettings(trackA).centerAmount).toBe(0.7);
    expect(karaoke.getSettings(trackA).isDefault).toBe(false);
  });

  it('isolates settings per track', () => {
    karaoke.saveSettings(trackA, { centerAmount: 0.5 });
    karaoke.saveSettings(trackB, { centerAmount: 0.9 });
    expect(karaoke.getSettings(trackA).centerAmount).toBe(0.5);
    expect(karaoke.getSettings(trackB).centerAmount).toBe(0.9);
  });

  it('reset removes saved settings', () => {
    karaoke.saveSettings(trackA, { centerAmount: 0.4 });
    karaoke.resetSettings(trackA);
    expect(karaoke.getSettings(trackA).isDefault).toBe(true);
    expect(karaoke.getSettings(trackA).centerAmount).toBe(
      KARAOKE_DEFAULTS.centerAmount,
    );
  });

  it('stores and retrieves sticky global mode', () => {
    expect(karaoke.getMode()).toBe('off');
    karaoke.setMode('vocal-reduction');
    expect(karaoke.getMode()).toBe('vocal-reduction');
    karaoke.setMode('ai');
    expect(karaoke.getMode()).toBe('ai');
  });

  it('rejects invalid mode', () => {
    expect(() => karaoke.setMode('invalid')).toThrow(BadRequestException);
  });

  it('getState reflects mode and defaults when idle', () => {
    const state = karaoke.getState();
    expect(state.mode).toBe('off');
    expect(state.trackId).toBeNull();
    expect(state.isDefault).toBe(true);
    expect(state.stem).toBeNull();
  });

  it('getState includes stem for current track', () => {
    const queueItemId = insertQueueItem(db, trackA);
    setCurrentTrack(db, queueItemId);
    const trackRow = db.raw
      .prepare(`SELECT mtime_ms, size_bytes FROM tracks WHERE id = ?`)
      .get(trackA) as { mtime_ms: number; size_bytes: number };
    const now = Date.now();
    db.raw
      .prepare(
        `INSERT INTO karaoke_stems (
           track_id, status, model, file_path, source_mtime_ms, source_size_bytes,
           created_at, updated_at
         ) VALUES (?, 'ready', 'htdemucs', ?, ?, ?, ?, ?)`,
      )
      .run(
        trackA,
        '/tmp/stem.mp3',
        trackRow.mtime_ms,
        trackRow.size_bytes,
        now,
        now,
      );
    const state = karaoke.getState();
    expect(state.stem?.trackId).toBe(trackA);
    expect(state.stem?.status).toBe('ready');
    expect(state.stem?.url).toBe(`/api/tracks/${trackA}/karaoke-stem`);
  });

  it('getState loads saved settings for current track', () => {
    const queueItemId = insertQueueItem(db, trackA);
    setCurrentTrack(db, queueItemId);
    karaoke.saveSettings(trackA, { centerAmount: 0.55 });
    const state = karaoke.getState();
    expect(state.trackId).toBe(trackA);
    expect(state.live.centerAmount).toBe(0.55);
    expect(state.isDefault).toBe(true);
  });

  it('patchLive updates unsaved live tuning', () => {
    const queueItemId = insertQueueItem(db, trackA);
    setCurrentTrack(db, queueItemId);
    karaoke.patchLive({ centerAmount: 0.33 });
    const state = karaoke.getState();
    expect(state.live.centerAmount).toBe(0.33);
    expect(state.isDefault).toBe(false);
    expect(karaoke.getSettings(trackA).isDefault).toBe(true);
  });

  it('resets live tuning when track changes', () => {
    const itemA = insertQueueItem(db, trackA);
    const itemB = insertQueueItem(db, trackB);
    setCurrentTrack(db, itemA);
    karaoke.patchLive({ centerAmount: 0.33 });
    setCurrentTrack(db, itemB);
    karaoke.saveSettings(trackB, { centerAmount: 0.75 });
    const state = karaoke.getState();
    expect(state.trackId).toBe(trackB);
    expect(state.live.centerAmount).toBe(0.75);
    setCurrentTrack(db, itemA);
    const back = karaoke.getState();
    expect(back.trackId).toBe(trackA);
    expect(back.live.centerAmount).toBe(0.33);
  });

  it('rejects invalid live patch values', () => {
    const queueItemId = insertQueueItem(db, trackA);
    setCurrentTrack(db, queueItemId);
    expect(() => karaoke.patchLive({ centerAmount: 5 })).toThrow(
      BadRequestException,
    );
  });
});

function insertQueueItem(db: TestDbService, trackId: number): number {
  const now = Date.now();
  db.raw
    .prepare(
      `INSERT INTO queue_items (track_id, position, added_at) VALUES (?, 0, ?)`,
    )
    .run(trackId, now);
  const row = db.raw
    .prepare(`SELECT id FROM queue_items WHERE track_id = ?`)
    .get(trackId) as { id: number };
  return row.id;
}

function setCurrentTrack(db: TestDbService, queueItemId: number): void {
  db.raw
    .prepare(
      `UPDATE playback_state SET current_queue_item_id = ?, updated_at = ? WHERE id = 1`,
    )
    .run(queueItemId, Date.now());
}
