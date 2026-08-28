import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SeparationService } from './separation.service';
import { createTestDb, insertTrack, TestDbService } from '../test/test-db';
import type { SpawnDemucsOptions } from './demucs-cli';

describe('SeparationService', () => {
  let db: TestDbService;
  let cleanup: () => void;
  let separation: SeparationService;
  let libraryDir: string;
  let stemCache: string;
  let config: {
    isDemucsAvailable: () => boolean;
    resolveDemucsExecutable: () => string | null;
    demucsModel: string;
    demucsExtraArgs: string[];
    demucsTimeoutMs: number;
    stemCachePath: string;
    resolveUnderLibrary: (rel: string) => string | null;
  };
  let session: {
    broadcast: ReturnType<typeof vi.fn>;
  };
  let queueService: {
    nextItemAfter: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    ({ db, cleanup } = createTestDb());
    libraryDir = mkdtempSync(join(tmpdir(), 'karaokej-lib-'));
    stemCache = mkdtempSync(join(tmpdir(), 'karaokej-stems-'));
    mkdirSync(join(libraryDir, 'a'), { recursive: true });
    writeFileSync(join(libraryDir, 'a/song.mp3'), 'fake-audio');

    session = { broadcast: vi.fn() };
    queueService = { nextItemAfter: vi.fn(() => null) };
    config = {
      isDemucsAvailable: () => true,
      resolveDemucsExecutable: () => '/usr/bin/demucs',
      demucsModel: 'htdemucs',
      demucsExtraArgs: [],
      demucsTimeoutMs: 60_000,
      stemCachePath: stemCache,
      resolveUnderLibrary: (rel: string) => join(libraryDir, rel),
    };

    separation = new SeparationService(
      db as never,
      config as never,
      session as never,
      queueService as never,
    );
    separation.setSpawnFn(async (options: SpawnDemucsOptions) => {
      const outDir = options.args[options.args.indexOf('-o') + 1];
      mkdirSync(join(outDir, 'htdemucs', 'song'), { recursive: true });
      writeFileSync(
        join(outDir, 'htdemucs', 'song', 'no_vocals.mp3'),
        'instrumental',
      );
      return { code: 0, signal: null };
    });
  });

  afterEach(async () => {
    separation.cancel();
    await new Promise((resolve) => setTimeout(resolve, 50));
    cleanup();
  });

  it('dedupes queue requests for the same track', async () => {
    const trackId = insertTrack(db, {
      relativePath: 'a/song.mp3',
      title: 'Song',
    });
    separation.request(trackId);
    separation.request(trackId);
    expect(
      db.raw
        .prepare(`SELECT COUNT(*) AS n FROM karaoke_stems WHERE track_id = ?`)
        .get(trackId),
    ).toEqual({ n: 1 });
  });

  it('marks unsupported when demucs is unavailable', () => {
    config.isDemucsAvailable = () => false;
    config.resolveDemucsExecutable = () => null;
    const trackId = insertTrack(db, {
      relativePath: 'a/song.mp3',
      title: 'Song',
    });
    separation.request(trackId);
    const dto = separation.getStemDto(trackId);
    expect(dto.status).toBe('unsupported');
  });

  it('processes track and writes ready stem', async () => {
    const trackId = insertTrack(db, {
      relativePath: 'a/song.mp3',
      title: 'Song',
    });
    const produced = join(stemCache, 'produced', 'htdemucs', 'song', 'no_vocals.mp3');
    mkdirSync(join(stemCache, 'produced', 'htdemucs', 'song'), {
      recursive: true,
    });
    writeFileSync(produced, 'instrumental');

    separation.setSpawnFn(async (options: SpawnDemucsOptions) => {
      const outDir = options.args[options.args.indexOf('-o') + 1];
      const dest = join(outDir, 'htdemucs', 'song', 'no_vocals.mp3');
      mkdirSync(join(outDir, 'htdemucs', 'song'), { recursive: true });
      writeFileSync(dest, 'instrumental');
      return { code: 0, signal: null };
    });

    separation.request(trackId);
    await waitFor(() => separation.getStemDto(trackId).status === 'ready');
    const dto = separation.getStemDto(trackId);
    expect(dto.status).toBe('ready');
    expect(dto.url).toBe(`/api/tracks/${trackId}/karaoke-stem`);
    expect(existsSync(join(stemCache, `${trackId}.mp3`))).toBe(true);
  });

  it('records failure when demucs exits non-zero', async () => {
    const trackId = insertTrack(db, {
      relativePath: 'a/song.mp3',
      title: 'Song',
    });
    separation.setSpawnFn(async () => ({ code: 1, signal: null }));
    separation.request(trackId);
    await waitFor(() => separation.getStemDto(trackId).status === 'failed');
    expect(separation.getStemDto(trackId).error).toContain('code 1');
  });

  it('recovers processing rows on boot', async () => {
    const trackId = insertTrack(db, {
      relativePath: 'a/song.mp3',
      title: 'Song',
    });
    const now = Date.now();
    db.raw
      .prepare(
        `INSERT INTO karaoke_stems (
           track_id, status, source_mtime_ms, source_size_bytes, created_at, updated_at
         ) VALUES (?, 'processing', 1000, 1000, ?, ?)`,
      )
      .run(trackId, now, now);

    separation.setSpawnFn(async (options: SpawnDemucsOptions) => {
      const outDir = options.args[options.args.indexOf('-o') + 1];
      mkdirSync(join(outDir, 'htdemucs', 'song'), { recursive: true });
      writeFileSync(
        join(outDir, 'htdemucs', 'song', 'no_vocals.mp3'),
        'instrumental',
      );
      return { code: 0, signal: null };
    });

    separation.onModuleInit();
    await waitFor(() => separation.getStemDto(trackId).status === 'ready');
  });
});

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 5000,
): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('Timed out waiting for condition');
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}
