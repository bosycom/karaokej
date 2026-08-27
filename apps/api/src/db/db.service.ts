import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DatabaseSync, StatementSync, type SQLInputValue } from 'node:sqlite';
import { AppConfigService } from '../config/app-config.service';
import { SCHEMA_SQL } from './schema';

interface Statement {
  run(...params: unknown[]): unknown;
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
}

class SqliteDb {
  constructor(private readonly db: DatabaseSync) {}

  exec(sql: string): void {
    this.db.exec(sql);
  }

  prepare(sql: string): Statement {
    const stmt: StatementSync = this.db.prepare(sql);
    return {
      run: (...params: unknown[]) => stmt.run(...(params as SQLInputValue[])),
      get: (...params: unknown[]) => stmt.get(...(params as SQLInputValue[])),
      all: (...params: unknown[]) => stmt.all(...(params as SQLInputValue[])),
    };
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
    this.seedSingletons();
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
  }
}
