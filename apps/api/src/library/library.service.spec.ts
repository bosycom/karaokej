import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { LibraryService } from './library.service';
import { createMockSession } from '../test/mock-session';
import { createTestDb, insertTrack, TestDbService } from '../test/test-db';

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
