import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { SCHEMA_SQL } from '../db/schema';
import { AppConfigService } from './app-config.service';
import { SETTING_TOOL_PATH_YTDLP } from '../settings/tool-path-keys';

describe('AppConfigService tool path overrides', () => {
  let dir: string;
  let dbPath: string;
  let appConfig: AppConfigService;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'karaokej-config-'));
    dbPath = join(dir, 'test.sqlite');
    const db = new DatabaseSync(dbPath);
    db.exec(SCHEMA_SQL);
    db.close();

    const values: Record<string, string | undefined> = {
      DATABASE_PATH: dbPath,
      YTDLP_PATH: '/env/ytdlp.exe',
    };
    appConfig = new AppConfigService({
      get: (key: string) => values[key],
    } as never);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('prefers saved override over .env', () => {
    expect(appConfig.ytdlpPath).toBe('/env/ytdlp.exe');

    const db = new DatabaseSync(dbPath);
    db.prepare(
      `INSERT INTO app_settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    ).run(SETTING_TOOL_PATH_YTDLP, '/saved/yt-dlp.exe');
    db.close();

    appConfig.clearToolPathOverrideCache();
    expect(appConfig.ytdlpPath).toBe('/saved/yt-dlp.exe');
  });
});
