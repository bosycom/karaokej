import { Injectable } from '@nestjs/common';
import { AppSettingsDto } from '@karaokej/shared';
import { DbService } from '../db/db.service';

export const SETTING_REMOVE_PLAYED_FROM_QUEUE = 'remove_played_from_queue';

@Injectable()
export class SettingsService {
  constructor(private readonly db: DbService) {}

  get(): AppSettingsDto {
    return {
      removePlayedFromQueue: this.getBoolean(SETTING_REMOVE_PLAYED_FROM_QUEUE),
    };
  }

  patch(partial: Partial<AppSettingsDto>): AppSettingsDto {
    if (partial.removePlayedFromQueue !== undefined) {
      this.setBoolean(SETTING_REMOVE_PLAYED_FROM_QUEUE, partial.removePlayedFromQueue);
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
}
