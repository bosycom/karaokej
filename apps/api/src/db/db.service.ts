import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DatabaseSync } from 'node:sqlite';
import { AppConfigService } from '../config/app-config.service';
import { SCHEMA_SQL } from './schema';
import { type Statement, wrapStatement } from './sqlite-statement';

class SqliteDb {
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

@Injectable()
export class DbService implements OnModuleInit, OnModuleDestroy {
  private db: SqliteDb;

  constructor(private readonly config: AppConfigService) {}

  onModuleInit(): void {
    const raw = new DatabaseSync(this.config.databasePath);
    this.db = new SqliteDb(raw);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec('PRAGMA foreign_keys = ON');
    this.db.exec('PRAGMA busy_timeout = 5000');
    this.db.exec(SCHEMA_SQL);
    this.migrate();
    this.seedSingletons();
  }

  private migrate(): void {
    const columns = this.db
      .prepare(`PRAGMA table_info(tracks)`)
      .all() as Array<{ name: string }>;
    const names = new Set(columns.map((col) => col.name));
    if (!names.has('rating')) {
      this.db.exec(`ALTER TABLE tracks ADD COLUMN rating INTEGER`);
    }
    if (!names.has('available')) {
      this.db.exec(`ALTER TABLE tracks ADD COLUMN available INTEGER NOT NULL DEFAULT 1`);
      this.db.exec(`UPDATE tracks SET available = 1 WHERE available IS NULL`);
    }
    if (!names.has('year')) {
      this.db.exec(`ALTER TABLE tracks ADD COLUMN year INTEGER`);
    }
    if (!names.has('genres')) {
      this.db.exec(`ALTER TABLE tracks ADD COLUMN genres TEXT`);
    }
    if (!names.has('metadata_status')) {
      this.db.exec(
        `ALTER TABLE tracks ADD COLUMN metadata_status TEXT NOT NULL DEFAULT 'ready'`,
      );
      this.db.exec(`UPDATE tracks SET metadata_status = 'ready' WHERE metadata_status IS NULL`);
    }
    if (!names.has('cover_group')) {
      this.db.exec(`ALTER TABLE tracks ADD COLUMN cover_group TEXT`);
    }
    if (!names.has('musicbrainz_artist_id')) {
      this.db.exec(`ALTER TABLE tracks ADD COLUMN musicbrainz_artist_id TEXT`);
    }
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_tracks_cover_group ON tracks(cover_group)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_tracks_rating ON tracks(rating)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_tracks_available ON tracks(available)`);
    this.db.exec(
      `CREATE INDEX IF NOT EXISTS idx_tracks_metadata_status ON tracks(metadata_status)`,
    );
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS library_dir_stats (
        relative_path TEXT PRIMARY KEY,
        mtime_ms INTEGER NOT NULL
      )
    `);
    this.db.exec(`
      UPDATE tracks SET duration_ms = NULL
      WHERE duration_ms IS NOT NULL
        AND (duration_ms <= 0 OR duration_ms > 86400000)
    `);
    this.migrateReliableDuration();
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS artist_bios (
        lookup_key TEXT PRIMARY KEY,
        display_name TEXT,
        audiodb_id TEXT,
        musicbrainz_id TEXT,
        status TEXT NOT NULL,
        biography TEXT,
        genre TEXT,
        style TEXT,
        mood TEXT,
        country TEXT,
        formed_year TEXT,
        albums_json TEXT,
        top_tracks_json TEXT,
        fetched_at INTEGER NOT NULL,
        extras_fetched_at INTEGER
      )
    `);
    this.db.exec(
      `CREATE INDEX IF NOT EXISTS idx_artist_bios_mbid ON artist_bios(musicbrainz_id)`,
    );
  }

  private migrateReliableDuration(): void {
    const row = this.db
      .prepare(`SELECT value FROM app_settings WHERE key = ?`)
      .get('duration_reliable_v1') as { value: string } | undefined;
    if (row?.value === '1') {
      return;
    }
    this.db.exec(`UPDATE tracks SET duration_ms = NULL WHERE duration_ms IS NOT NULL`);
    this.db
      .prepare(`INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)`)
      .run('duration_reliable_v1', '1');
  }

  onModuleDestroy(): void {
    this.db?.close();
  }

  get raw(): SqliteDb {
    return this.db;
  }

  private seedSingletons(): void {
    const now = Date.now();
    this.db
      .prepare(
        `INSERT OR IGNORE INTO playback_state (id, status, position_ms, volume, seek_seq, updated_at)
         VALUES (1, 'idle', 0, 1, 0, ?)`,
      )
      .run(now);
    this.db
      .prepare(
        `INSERT OR IGNORE INTO jobs (kind, running, current, total, message, updated_at)
         VALUES (?, 0, 0, 0, NULL, ?)`,
      )
      .run('scan', now);
    this.db
      .prepare(
        `INSERT OR IGNORE INTO jobs (kind, running, current, total, message, updated_at)
         VALUES (?, 0, 0, 0, NULL, ?)`,
      )
      .run('lyrics', now);
    this.db
      .prepare(
        `INSERT OR IGNORE INTO jobs (kind, running, current, total, message, updated_at)
         VALUES (?, 0, 0, 0, NULL, ?)`,
      )
      .run('download', now);
    this.db
      .prepare(
        `INSERT OR IGNORE INTO jobs (kind, running, current, total, message, updated_at)
         VALUES (?, 0, 0, 0, NULL, ?)`,
      )
      .run('separation', now);
    this.db
      .prepare(
        `INSERT OR IGNORE INTO jobs (kind, running, current, total, message, updated_at)
         VALUES (?, 0, 0, 0, NULL, ?)`,
      )
      .run('covers', now);
    this.db
      .prepare(
        `INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)`,
      )
      .run('remove_played_from_queue', '0');
    this.db
      .prepare(
        `INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)`,
      )
      .run('karaoke_mode', 'off');
    this.db
      .prepare(
        `INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)`,
      )
      .run('crossfade_seconds', '0');
    this.db
      .prepare(
        `INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)`,
      )
      .run('crossfade_seconds_pref', '5');
  }
}
