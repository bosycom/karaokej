import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { NotFoundException } from '@nestjs/common';
import { LibraryService } from './library.service';
import { createMockSession } from '../test/mock-session';
import { createMockSeparation } from '../test/mock-separation';
import { createTestDb, insertTrack, TestDbService } from '../test/test-db';
import { coverGroupKey } from '../covers/cover-group-key';
import { coverFilePath, writeCoverFile } from '../covers/cover-storage';

const COVER_HASH = 'c'.repeat(64);

function seedCover(
  db: TestDbService,
  cacheRoot: string,
  groupKey: string,
  hash: string,
): void {
  writeCoverFile(cacheRoot, hash, 'sm', 'webp', Buffer.from('sm'));
  writeCoverFile(cacheRoot, hash, 'lg', 'webp', Buffer.from('lg'));
  db.raw
    .prepare(`INSERT INTO covers (hash, format, created_at) VALUES (?, 'webp', ?)`)
    .run(hash, Date.now());
  db.raw
    .prepare(
      `INSERT INTO cover_groups (group_key, status, cover_hash, source_kind, checked_at)
       VALUES (?, 'ready', ?, 'embedded', ?)`,
    )
    .run(groupKey, hash, Date.now());
}

describe('LibraryService.search', () => {
  let db: TestDbService;
  let cleanup: () => void;
  let library: LibraryService;

  beforeEach(() => {
    ({ db, cleanup } = createTestDb());
    library = new LibraryService(
      db as never,
      { libraryPaths: [] } as never,
      createMockSession(db),
      createMockSeparation(),
    );
  });

  afterEach(() => {
    cleanup();
  });

  it('returns all tracks when hideDuplicates is off', () => {
    insertTrack(db, {
      relativePath: 'a/song.mp3',
      title: 'Same Song',
      artist: 'Artist',
      format: 'mp3',
      durationMs: 180_000,
    });
    insertTrack(db, {
      relativePath: 'a/song.opus',
      title: 'Same Song',
      artist: 'Artist',
      format: 'opus',
      durationMs: 180_000,
    });

    const page = library.search('', 1, 50, undefined, false);
    expect(page.total).toBe(2);
    expect(page.items).toHaveLength(2);
  });

  it('collapses duplicate formats and prefers lyrics', () => {
    const mp3Id = insertTrack(db, {
      relativePath: 'a/song.mp3',
      title: 'Same Song',
      artist: 'Artist',
      format: 'mp3',
      durationMs: 180_000,
      lyricStatus: 'missing',
    });
    const opusId = insertTrack(db, {
      relativePath: 'a/song.opus',
      title: 'Same Song',
      artist: 'Artist',
      format: 'opus',
      durationMs: 180_500,
      lyricStatus: 'present',
    });

    const page = library.search('', 1, 50, undefined, true);
    expect(page.total).toBe(1);
    expect(page.items).toHaveLength(1);
    expect(page.items[0]!.id).toBe(opusId);
    expect(page.items[0]!.id).not.toBe(mp3Id);
  });

  it('treats durations within about two seconds as the same length', () => {
    insertTrack(db, {
      relativePath: 'a/song-a.mp3',
      title: 'Near Length',
      artist: 'Artist',
      durationMs: 180_000,
    });
    insertTrack(db, {
      relativePath: 'a/song-a.flac',
      title: 'Near Length',
      artist: 'Artist',
      durationMs: 181_500,
    });
    insertTrack(db, {
      relativePath: 'b/other.mp3',
      title: 'Other Song',
      artist: 'Artist',
      durationMs: 180_000,
    });

    const page = library.search('', 1, 50, undefined, true);
    expect(page.total).toBe(2);
    expect(page.items.map((track) => track.title).sort()).toEqual([
      'Near Length',
      'Other Song',
    ]);
  });

  it('keeps lowest id when lyrics status matches', () => {
    const firstId = insertTrack(db, {
      relativePath: 'a/first.mp3',
      title: 'Tie Break',
      artist: 'Artist',
      durationMs: 200_000,
      lyricStatus: 'missing',
    });
    insertTrack(db, {
      relativePath: 'a/second.opus',
      title: 'Tie Break',
      artist: 'Artist',
      durationMs: 200_000,
      lyricStatus: 'missing',
    });

    const page = library.search('', 1, 50, undefined, true);
    expect(page.total).toBe(1);
    expect(page.items[0]!.id).toBe(firstId);
  });

  it('does not collapse pending path-only rows when hiding duplicates', () => {
    insertTrack(db, {
      relativePath: 'a/song.mp3',
      title: 'Same Song',
      artist: 'Artist',
      format: 'mp3',
      durationMs: null,
      metadataStatus: 'pending',
    });
    insertTrack(db, {
      relativePath: 'a/song.opus',
      title: 'Same Song',
      artist: 'Artist',
      format: 'opus',
      durationMs: 180_000,
      metadataStatus: 'ready',
    });

    const page = library.search('', 1, 50, undefined, true);
    expect(page.total).toBe(2);
    expect(page.items).toHaveLength(2);
  });

  it('returns tracks with oversized duration_ms without throwing', () => {
    db.raw.exec(`
      INSERT INTO tracks (
        relative_path, format, size_bytes, mtime_ms, title, artist, album,
        duration_ms, lyric_status, metadata_status, available, created_at, updated_at
      ) VALUES (
        'bad/opus.opus', 'opus', 1000, 1, 'Bad Duration', 'The Doors', NULL,
        384307168202282304, 'missing', 'ready', 1, 1, 1
      )
    `);
    const page = library.search('Doors', 1, 50);
    expect(page.total).toBe(1);
    expect(page.items).toHaveLength(1);
    expect(page.items[0]!.title).toBe('Bad Duration');
    expect(page.items[0]!.durationMs).toBeNull();
  });

  it('finds tracks when the search query contains ampersands and periods', () => {
    const artist = 'Cappadonna feat. Timbo King & Masta Killa';
    insertTrack(db, {
      relativePath: 'a/cappadonna.mp3',
      title: 'Some Track',
      artist,
      format: 'mp3',
      durationMs: 180_000,
    });

    const fullQuery = library.search(artist, 1, 50);
    expect(fullQuery.total).toBe(1);
    expect(fullQuery.items[0]!.artist).toBe(artist);

    const partialQuery = library.search('Cappadonna & Killa', 1, 50);
    expect(partialQuery.total).toBe(1);
    expect(partialQuery.items[0]!.artist).toBe(artist);
  });
});

describe('LibraryService scan job recovery', () => {
  let db: TestDbService;
  let cleanup: () => void;
  let library: LibraryService;

  const mockConfig = {
    libraryPaths: [],
    ytsaverPath: '/missing/ytsaver',
    ytdlpPath: '/missing/ytdlp',
    demucsPath: '/missing/demucs',
    isDemucsAvailable: () => false,
  };

  beforeEach(() => {
    ({ db, cleanup } = createTestDb());
    library = new LibraryService(
      db as never,
      mockConfig as never,
      createMockSession(db),
      createMockSeparation(),
    );
    db.raw
      .prepare(
        `UPDATE jobs SET running = 1, current = 100, total = 200, message = ?, updated_at = ? WHERE kind = 'scan'`,
      )
      .run('Indexing paths (1/2)', Date.now());
  });

  afterEach(() => {
    cleanup();
  });

  it('clears an orphaned running scan on startup', () => {
    library.onModuleInit();
    const scan = library.jobStatus('scan');
    expect(scan.running).toBe(false);
    expect(scan.current).toBe(100);
    expect(scan.total).toBe(200);
    expect(scan.message).toBe('Scan interrupted (server restarted)');
  });

  it('clears an orphaned running scan on refresh', () => {
    library.refreshScan();
    const scan = library.jobStatus('scan');
    expect(scan.running).toBe(false);
    expect(scan.current).toBe(100);
    expect(scan.total).toBe(200);
    expect(scan.message).toBe('Scan interrupted (no worker running)');
  });

  it('leaves a live in-memory scan running on refresh', () => {
    (library as unknown as { scanRunning: boolean }).scanRunning = true;
    library.refreshScan();
    const scan = library.jobStatus('scan');
    expect(scan.running).toBe(true);
    expect(scan.message).toBe('Indexing paths (1/2)');
  });

  it('cancels an orphaned scan even when no worker is in memory', () => {
    library.cancelScan();
    const scan = library.jobStatus('scan');
    expect(scan.running).toBe(false);
    expect(scan.message).toBe('Scan cancelled');
  });
});

describe('LibraryService.getRandomArtist', () => {
  let db: TestDbService;
  let cleanup: () => void;
  let library: LibraryService;

  beforeEach(() => {
    ({ db, cleanup } = createTestDb());
    library = new LibraryService(
      db as never,
      { libraryPaths: [] } as never,
      createMockSession(db),
      createMockSeparation(),
    );
  });

  afterEach(() => {
    cleanup();
  });

  it('throws when the catalogue has no artist names', () => {
    expect(() => library.getRandomArtist()).toThrow(NotFoundException);
  });

  it('returns one of the distinct artist names', () => {
    insertTrack(db, {
      relativePath: 'a/song.mp3',
      title: 'Song A',
      artist: 'Alpha',
    });
    insertTrack(db, {
      relativePath: 'b/song.mp3',
      title: 'Song B',
      artist: 'Beta',
    });
    insertTrack(db, {
      relativePath: 'c/song.mp3',
      title: 'Song C',
      artist: 'Alpha',
    });

    const result = library.getRandomArtist();
    expect(['Alpha', 'Beta']).toContain(result.artist);
  });

  it('returns a different artist when exclude is provided and another exists', () => {
    insertTrack(db, {
      relativePath: 'a/song.mp3',
      title: 'Song A',
      artist: 'Alpha',
    });
    insertTrack(db, {
      relativePath: 'b/song.mp3',
      title: 'Song B',
      artist: 'Beta',
    });

    const result = library.getRandomArtist('Alpha');
    expect(result.artist).toBe('Beta');
  });

  it('returns the only artist when exclude matches the sole name', () => {
    insertTrack(db, {
      relativePath: 'a/song.mp3',
      title: 'Song A',
      artist: 'Solo Artist',
    });

    const result = library.getRandomArtist('Solo Artist');
    expect(result.artist).toBe('Solo Artist');
  });
});

describe('LibraryService.deleteTrackFile', () => {
  let db: TestDbService;
  let cleanup: () => void;
  let library: LibraryService;
  let libraryRoot: string;
  let coverCachePath: string;
  let libraryCleanup: () => void;

  beforeEach(() => {
    ({ db, cleanup } = createTestDb());
    libraryRoot = mkdtempSync(join(tmpdir(), 'karaokej-lib-'));
    coverCachePath = mkdtempSync(join(tmpdir(), 'karaokej-lib-covers-'));
    libraryCleanup = () => {
      rmSync(libraryRoot, { recursive: true, force: true });
      rmSync(coverCachePath, { recursive: true, force: true });
    };

    library = new LibraryService(
      db as never,
      {
        resolveUnderLibrary: (relativePath: string) =>
          join(libraryRoot, relativePath),
        get coverCachePath() {
          return coverCachePath;
        },
      } as never,
      createMockSession(db),
      createMockSeparation(),
    );
  });

  afterEach(() => {
    libraryCleanup();
    cleanup();
  });

  it('deletes audio and lrc files and removes catalogue, queue, and playlist rows', () => {
    const audioPath = join(libraryRoot, 'song.mp3');
    const lrcPath = join(libraryRoot, 'song.lrc');
    writeFileSync(audioPath, 'audio');
    writeFileSync(lrcPath, '[00:00.00]Lyrics');

    const trackId = insertTrack(db, {
      relativePath: 'song.mp3',
      title: 'Song',
      artist: 'Artist',
    });

    db.raw
      .prepare(`INSERT INTO queue_items (track_id, position, added_at) VALUES (?, 0, ?)`)
      .run(trackId, Date.now());
    db.raw
      .prepare(
        `INSERT INTO playlists (name, created_at, updated_at) VALUES ('Test', ?, ?)`,
      )
      .run(Date.now(), Date.now());
    const playlist = db.raw
      .prepare(`SELECT id FROM playlists LIMIT 1`)
      .get() as { id: number };
    db.raw
      .prepare(
        `INSERT INTO playlist_items (playlist_id, track_id, position, added_at) VALUES (?, ?, 0, ?)`,
      )
      .run(playlist.id, trackId, Date.now());

    library.deleteTrackFile(trackId);

    expect(existsSync(audioPath)).toBe(false);
    expect(existsSync(lrcPath)).toBe(false);
    expect(library.getTrack(trackId)).toBeUndefined();
    expect(
      db.raw.prepare(`SELECT COUNT(*) AS c FROM queue_items`).get() as { c: number },
    ).toEqual({ c: 0 });
    expect(
      db.raw
        .prepare(`SELECT COUNT(*) AS c FROM playlist_items WHERE track_id = ?`)
        .get(trackId) as { c: number },
    ).toEqual({ c: 0 });
  });

  it('removes cover thumbnails when the last track of an album is deleted', () => {
    writeFileSync(join(libraryRoot, 'only.mp3'), 'audio');
    const trackId = insertTrack(db, {
      relativePath: 'only.mp3',
      title: 'Only',
      album: 'Solo Album',
    });
    const groupKey = coverGroupKey('only.mp3', 'Solo Album');
    seedCover(db, coverCachePath, groupKey, COVER_HASH);

    library.deleteTrackFile(trackId);

    expect(
      existsSync(coverFilePath(coverCachePath, COVER_HASH, 'sm', 'webp')),
    ).toBe(false);
    expect(
      db.raw
        .prepare(`SELECT COUNT(*) AS c FROM cover_groups WHERE group_key = ?`)
        .get(groupKey) as { c: number },
    ).toEqual({ c: 0 });
    expect(
      db.raw.prepare(`SELECT COUNT(*) AS c FROM covers`).get() as { c: number },
    ).toEqual({ c: 0 });
  });

  it('keeps cover thumbnails while other tracks of the album remain', () => {
    writeFileSync(join(libraryRoot, 'one.mp3'), 'audio');
    writeFileSync(join(libraryRoot, 'two.mp3'), 'audio');
    const first = insertTrack(db, {
      relativePath: 'one.mp3',
      title: 'One',
      album: 'Shared Album',
    });
    insertTrack(db, {
      relativePath: 'two.mp3',
      title: 'Two',
      album: 'Shared Album',
    });
    const groupKey = coverGroupKey('one.mp3', 'Shared Album');
    seedCover(db, coverCachePath, groupKey, COVER_HASH);

    library.deleteTrackFile(first);

    expect(
      existsSync(coverFilePath(coverCachePath, COVER_HASH, 'sm', 'webp')),
    ).toBe(true);
    expect(
      db.raw
        .prepare(`SELECT COUNT(*) AS c FROM cover_groups WHERE group_key = ?`)
        .get(groupKey) as { c: number },
    ).toEqual({ c: 1 });
  });
});
