import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { SCHEMA_SQL } from '../db/schema';
import { type Statement, wrapStatement } from '../db/sqlite-statement';

export class TestSqliteDb {
  constructor(private readonly db: DatabaseSync) {}

  exec(sql: string): void {
    this.db.exec(sql);
  }

  prepare(sql: string): Statement {
    return wrapStatement(this.db.prepare(sql));
  }

  transaction<T extends unknown[], R>(fn: (...args: T) => R): (...args: T) => R {
    return (...args: T) => {
      this.db.exec('BEGIN');
      try {
        const result = fn(...args);
        this.db.exec('COMMIT');
        return result;
      } catch (err) {
        this.db.exec('ROLLBACK');
        throw err;
      }
    };
  }

  close(): void {
    this.db.close();
  }
}

export class TestDbService {
  readonly raw: TestSqliteDb;

  constructor(dbPath: string) {
    const raw = new DatabaseSync(dbPath);
    this.raw = new TestSqliteDb(raw);
    this.raw.exec('PRAGMA foreign_keys = ON');
    this.raw.exec(SCHEMA_SQL);
    this.migrate();
    this.seedSingletons();
  }

  private migrate(): void {
    const columns = this.raw
      .prepare(`PRAGMA table_info(tracks)`)
      .all() as Array<{ name: string }>;
    const names = new Set(columns.map((col) => col.name));
    if (!names.has('rating')) {
      this.raw.exec(`ALTER TABLE tracks ADD COLUMN rating INTEGER`);
    }
    if (!names.has('available')) {
      this.raw.exec(`ALTER TABLE tracks ADD COLUMN available INTEGER NOT NULL DEFAULT 1`);
      this.raw.exec(`UPDATE tracks SET available = 1 WHERE available IS NULL`);
    }
    if (!names.has('year')) {
      this.raw.exec(`ALTER TABLE tracks ADD COLUMN year INTEGER`);
    }
    if (!names.has('genres')) {
      this.raw.exec(`ALTER TABLE tracks ADD COLUMN genres TEXT`);
    }
    if (!names.has('metadata_status')) {
      this.raw.exec(
        `ALTER TABLE tracks ADD COLUMN metadata_status TEXT NOT NULL DEFAULT 'ready'`,
      );
      this.raw.exec(`UPDATE tracks SET metadata_status = 'ready' WHERE metadata_status IS NULL`);
    }
    this.raw.exec(`CREATE INDEX IF NOT EXISTS idx_tracks_rating ON tracks(rating)`);
    this.raw.exec(`CREATE INDEX IF NOT EXISTS idx_tracks_available ON tracks(available)`);
    this.raw.exec(
      `CREATE INDEX IF NOT EXISTS idx_tracks_metadata_status ON tracks(metadata_status)`,
    );
  }

  private seedSingletons(): void {
    const now = Date.now();
    this.raw
      .prepare(
        `INSERT OR IGNORE INTO playback_state (id, status, position_ms, volume, seek_seq, updated_at)
         VALUES (1, 'idle', 0, 1, 0, ?)`,
      )
      .run(now);
    this.raw
      .prepare(
        `INSERT OR IGNORE INTO jobs (kind, running, current, total, message, updated_at)
         VALUES (?, 0, 0, 0, NULL, ?)`,
      )
      .run('scan', now);
    this.raw
      .prepare(
        `INSERT OR IGNORE INTO jobs (kind, running, current, total, message, updated_at)
         VALUES (?, 0, 0, 0, NULL, ?)`,
      )
      .run('lyrics', now);
    this.raw
      .prepare(`INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)`)
      .run('remove_played_from_queue', '0');
  }

  close(): void {
    this.raw.close();
  }
}

export function createTestDb(): { db: TestDbService; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'karaokej-test-'));
  const path = join(dir, 'test.sqlite');
  const db = new TestDbService(path);
  return {
    db,
    cleanup: () => {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

export function insertTrack(
  db: TestDbService,
  patch: {
    relativePath: string;
    title: string;
    artist?: string | null;
    album?: string | null;
    available?: number;
    format?: string;
    durationMs?: number | null;
    lyricStatus?: string;
    rating?: number | null;
    metadataStatus?: 'pending' | 'ready';
  },
): number {
  const now = Date.now();
  db.raw
    .prepare(
      `INSERT INTO tracks (
         relative_path, format, size_bytes, mtime_ms, title, artist, album,
         duration_ms, lyric_status, rating, metadata_status, available, created_at, updated_at
       ) VALUES (?, ?, 1000, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      patch.relativePath,
      patch.format ?? 'mp3',
      now,
      patch.title,
      patch.artist ?? null,
      patch.album ?? null,
      patch.durationMs ?? null,
      patch.lyricStatus ?? 'missing',
      patch.rating ?? null,
      patch.metadataStatus ?? 'ready',
      patch.available ?? 1,
      now,
      now,
    );
  const row = db.raw
    .prepare(`SELECT id FROM tracks WHERE relative_path = ?`)
    .get(patch.relativePath) as { id: number };
  return row.id;
}
