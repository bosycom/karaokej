import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  SETTING_CROSSFADE_SECONDS,
  SETTING_CROSSFADE_SECONDS_PREF,
  SettingsService,
} from './settings.service';
import { createTestDb, TestDbService } from '../test/test-db';

describe('SettingsService', () => {
  let db: TestDbService;
  let cleanup: () => void;
  let settings: SettingsService;

  beforeEach(() => {
    ({ db, cleanup } = createTestDb());
    settings = new SettingsService(db as never);
  });

  afterEach(() => {
    cleanup();
  });

  it('defaults crossfade to off with a 5 second preference', () => {
    expect(settings.get()).toEqual({
      removePlayedFromQueue: false,
      crossfadeSeconds: 0,
      crossfadePrefSeconds: 5,
    });
  });

  it('clamps crossfade seconds to 0 through 10', () => {
    expect(settings.patch({ crossfadeSeconds: 12 }).crossfadeSeconds).toBe(10);
    expect(settings.patch({ crossfadeSeconds: -3 }).crossfadeSeconds).toBe(0);
  });

  it('updates the preference when enabling a non-zero crossfade duration', () => {
    settings.patch({ crossfadeSeconds: 7 });
    expect(settings.get()).toMatchObject({
      crossfadeSeconds: 7,
      crossfadePrefSeconds: 7,
    });
  });

  it('keeps the preference when turning crossfade off', () => {
    settings.patch({ crossfadeSeconds: 8 });
    settings.patch({ crossfadeSeconds: 0 });
    expect(settings.get()).toMatchObject({
      crossfadeSeconds: 0,
      crossfadePrefSeconds: 8,
    });
  });

  it('persists crossfade values in app_settings', () => {
    settings.patch({ crossfadeSeconds: 4 });
    const live = db.raw
      .prepare(`SELECT value FROM app_settings WHERE key = ?`)
      .get(SETTING_CROSSFADE_SECONDS) as { value: string };
    const pref = db.raw
      .prepare(`SELECT value FROM app_settings WHERE key = ?`)
      .get(SETTING_CROSSFADE_SECONDS_PREF) as { value: string };
    expect(live.value).toBe('4');
    expect(pref.value).toBe('4');
  });
});
