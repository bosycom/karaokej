import { Injectable } from '@nestjs/common';
import {
  AppSettingsDto,
  DEFAULT_RATING_BLUE,
  DEFAULT_RATING_GOLD,
  DEFAULT_RATING_RASPBERRY,
  DEFAULT_RATING_SILVER,
} from '@karaokej/shared';
import { DbService } from '../db/db.service';

export const SETTING_REMOVE_PLAYED_FROM_QUEUE = 'remove_played_from_queue';
export const SETTING_CROSSFADE_SECONDS = 'crossfade_seconds';
export const SETTING_CROSSFADE_SECONDS_PREF = 'crossfade_seconds_pref';
export const SETTING_RATING_GOLD = 'rating_gold';
export const SETTING_RATING_SILVER = 'rating_silver';
export const SETTING_RATING_BLUE = 'rating_blue';
export const SETTING_RATING_RASPBERRY = 'rating_raspberry';

const DEFAULT_CROSSFADE_PREF = 5;
const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

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
      ratingGold: this.getHex(SETTING_RATING_GOLD, DEFAULT_RATING_GOLD),
      ratingSilver: this.getHex(SETTING_RATING_SILVER, DEFAULT_RATING_SILVER),
      ratingBlue: this.getHex(SETTING_RATING_BLUE, DEFAULT_RATING_BLUE),
      ratingRaspberry: this.getHex(
        SETTING_RATING_RASPBERRY,
        DEFAULT_RATING_RASPBERRY,
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
    if (partial.ratingGold !== undefined) {
      this.setHex(SETTING_RATING_GOLD, partial.ratingGold, DEFAULT_RATING_GOLD);
    }
    if (partial.ratingSilver !== undefined) {
      this.setHex(
        SETTING_RATING_SILVER,
        partial.ratingSilver,
        DEFAULT_RATING_SILVER,
      );
    }
    if (partial.ratingBlue !== undefined) {
      this.setHex(SETTING_RATING_BLUE, partial.ratingBlue, DEFAULT_RATING_BLUE);
    }
    if (partial.ratingRaspberry !== undefined) {
      this.setHex(
        SETTING_RATING_RASPBERRY,
        partial.ratingRaspberry,
        DEFAULT_RATING_RASPBERRY,
      );
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

  private getHex(key: string, fallback: string): string {
    const row = this.db.raw
      .prepare(`SELECT value FROM app_settings WHERE key = ?`)
      .get(key) as { value: string } | undefined;
    if (!row) {
      return fallback;
    }
    return normalizeHex(row.value, fallback);
  }

  private setHex(key: string, value: string, fallback: string): void {
    this.db.raw
      .prepare(
        `INSERT INTO app_settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run(key, normalizeHex(value, fallback));
  }
}

function clampInt(value: number, min: number, max: number): number {
  const rounded = Math.round(value);
  return Math.min(max, Math.max(min, rounded));
}

function normalizeHex(value: string, fallback: string): string {
  return HEX_COLOR_RE.test(value) ? value.toLowerCase() : fallback;
}
