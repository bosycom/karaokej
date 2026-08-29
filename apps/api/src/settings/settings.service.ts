import { Injectable } from '@nestjs/common';
import { AppSettingsDto } from '@karaokej/shared';
import { DbService } from '../db/db.service';

export const SETTING_REMOVE_PLAYED_FROM_QUEUE = 'remove_played_from_queue';
export const SETTING_CROSSFADE_SECONDS = 'crossfade_seconds';
export const SETTING_CROSSFADE_SECONDS_PREF = 'crossfade_seconds_pref';

const DEFAULT_CROSSFADE_PREF = 5;

@Injectable()
export class SettingsService {
  constructor(private readonly db: DbService) {}

  get(): AppSettingsDto {
    return {
      removePlayedFromQueue: this.getBoolean(SETTING_REMOVE_PLAYED_FROM_QUEUE),
      crossfadeSeconds: this.getInt(SETTING_CROSSFADE_SECONDS, 0, 0, 10),
      crossfadePrefSeconds: this.getInt(
        SETTING_CROSSFADE_SECONDS_PREF,
        DEFAULT_CROSSFADE_PREF,
        1,
        10,
      ),
    };
  }

  patch(partial: Partial<AppSettingsDto>): AppSettingsDto {
    if (partial.removePlayedFromQueue !== undefined) {
      this.setBoolean(SETTING_REMOVE_PLAYED_FROM_QUEUE, partial.removePlayedFromQueue);
    }
    if (partial.crossfadeSeconds !== undefined) {
      const clamped = clampInt(partial.crossfadeSeconds, 0, 10);
      this.setInt(SETTING_CROSSFADE_SECONDS, clamped, 0, 10);
      if (clamped > 0) {
        this.setInt(SETTING_CROSSFADE_SECONDS_PREF, clamped, 1, 10);
      }
    }
    return this.get();
  }

  isRemovePlayedFromQueueEnabled(): boolean {
    return this.getBoolean(SETTING_REMOVE_PLAYED_FROM_QUEUE);
  }

  private getBoolean(key: string): boolean {
    const row = this.db.raw
      .prepare(`SELECT value FROM app_settings WHERE key = ?`)
      .get(key) as { value: string } | undefined;
    return row?.value === '1';
  }

  private setBoolean(key: string, value: boolean): void {
    this.db.raw
      .prepare(
        `INSERT INTO app_settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run(key, value ? '1' : '0');
  }

  private getInt(
    key: string,
    fallback: number,
    min: number,
    max: number,
  ): number {
    const row = this.db.raw
      .prepare(`SELECT value FROM app_settings WHERE key = ?`)
      .get(key) as { value: string } | undefined;
    if (!row) {
      return fallback;
    }
    const parsed = Number.parseInt(row.value, 10);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return clampInt(parsed, min, max);
  }

  private setInt(key: string, value: number, min: number, max: number): void {
    this.db.raw
      .prepare(
        `INSERT INTO app_settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run(key, String(clampInt(value, min, max)));
  }
}

function clampInt(value: number, min: number, max: number): number {
  const rounded = Math.round(value);
  return Math.min(max, Math.max(min, rounded));
}
