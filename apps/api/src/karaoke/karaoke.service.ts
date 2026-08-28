import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import {
  KARAOKE_DEFAULTS,
  KaraokeMode,
  KaraokeSettingsDto,
  KaraokeStateDto,
  KaraokeTrackSettings,
  defaultKaraokeState,
  isKaraokeMode,
  karaokeTrackSettingsEqual,
  normalizeKaraokeSettings,
  serializeEqBands,
} from '@karaokej/shared';
import { DbService } from '../db/db.service';
import {
  KaraokeSettingsRow,
  karaokeSettingsRowToTrackSettings,
  karaokeSettingsToDto,
} from '../db/types';
import { SeparationService } from './separation.service';

export const SETTING_KARAOKE_MODE = 'karaoke_mode';

@Injectable()
export class KaraokeService {
  /** In-memory live tuning for the current track (unsaved slider tweaks). */
  private liveByTrackId = new Map<number, KaraokeTrackSettings>();
  private liveTrackId: number | null = null;

  constructor(
    private readonly db: DbService,
    @Inject(forwardRef(() => SeparationService))
    private readonly separation: SeparationService,
  ) {}

  getMode(): KaraokeMode {
    const row = this.db.raw
      .prepare(`SELECT value FROM app_settings WHERE key = ?`)
      .get(SETTING_KARAOKE_MODE) as { value: string } | undefined;
    const value = row?.value ?? 'off';
    return isKaraokeMode(value) ? value : 'off';
  }

  setMode(mode: unknown): KaraokeMode {
    if (!isKaraokeMode(mode)) {
      throw new BadRequestException('Invalid karaoke mode');
    }
    this.db.raw
      .prepare(
        `INSERT INTO app_settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run(SETTING_KARAOKE_MODE, mode);
    return mode;
  }

  getSettings(trackId: number): KaraokeSettingsDto {
    this.ensureTrackExists(trackId);
    const row = this.db.raw
      .prepare(`SELECT * FROM karaoke_settings WHERE track_id = ?`)
      .get(trackId) as KaraokeSettingsRow | undefined;
    return karaokeSettingsToDto(trackId, row ?? null, !row);
  }

  saveSettings(trackId: number, raw: unknown): KaraokeSettingsDto {
    this.ensureTrackExists(trackId);
    const { settings, errors } = normalizeKaraokeSettings(raw);
    if (errors.length > 0) {
      throw new BadRequestException(errors.join('; '));
    }
    const now = Date.now();
    const existing = this.db.raw
      .prepare(`SELECT created_at FROM karaoke_settings WHERE track_id = ?`)
      .get(trackId) as { created_at: number } | undefined;
    const createdAt = existing?.created_at ?? now;
    this.db.raw
      .prepare(
        `INSERT INTO karaoke_settings (
           track_id, center_amount, bass_retain_hz, treble_retain_hz,
           makeup_gain_db, eq_bands, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(track_id) DO UPDATE SET
           center_amount = excluded.center_amount,
           bass_retain_hz = excluded.bass_retain_hz,
           treble_retain_hz = excluded.treble_retain_hz,
           makeup_gain_db = excluded.makeup_gain_db,
           eq_bands = excluded.eq_bands,
           updated_at = excluded.updated_at`,
      )
      .run(
        trackId,
        settings.centerAmount,
        settings.bassRetainHz,
        settings.trebleRetainHz,
        settings.makeupGainDb,
        serializeEqBands(settings.eqBands),
        createdAt,
        now,
      );
    this.liveByTrackId.set(trackId, cloneSettings(settings));
    this.liveTrackId = trackId;
    return this.getSettings(trackId);
  }

  resetSettings(trackId: number): KaraokeSettingsDto {
    this.ensureTrackExists(trackId);
    this.db.raw
      .prepare(`DELETE FROM karaoke_settings WHERE track_id = ?`)
      .run(trackId);
    this.liveByTrackId.delete(trackId);
    if (this.liveTrackId === trackId) {
      this.liveTrackId = trackId;
    }
    return this.getSettings(trackId);
  }

  patchLive(raw: unknown, trackId?: number | null): KaraokeStateDto {
    const targetTrackId = trackId ?? this.getCurrentTrackId();
    if (targetTrackId == null) {
      throw new BadRequestException('No track is currently playing');
    }
    this.ensureTrackExists(targetTrackId);
    const { settings, errors } = normalizeKaraokeSettings(raw);
    if (errors.length > 0) {
      throw new BadRequestException(errors.join('; '));
    }
    this.syncLiveTrack(targetTrackId);
    this.liveByTrackId.set(targetTrackId, cloneSettings(settings));
    return this.getState();
  }

  getState(): KaraokeStateDto {
    const mode = this.getMode();
    const trackId = this.getCurrentTrackId();
    if (trackId == null) {
      return {
        ...defaultKaraokeState(),
        mode,
        stem: null,
      };
    }
    this.syncLiveTrack(trackId);
    const saved = this.loadSavedSettings(trackId);
    const live = this.liveByTrackId.get(trackId) ?? saved;
    const isDefault = karaokeTrackSettingsEqual(live, saved);
    return {
      mode,
      live: cloneSettings(live),
      isDefault,
      trackId,
      stem: this.separation.getStemDto(trackId),
    };
  }

  private syncLiveTrack(trackId: number): void {
    if (this.liveTrackId === trackId) {
      return;
    }
    this.liveTrackId = trackId;
    if (!this.liveByTrackId.has(trackId)) {
      this.liveByTrackId.set(trackId, this.loadSavedSettings(trackId));
    }
  }

  private loadSavedSettings(trackId: number): KaraokeTrackSettings {
    const row = this.db.raw
      .prepare(`SELECT * FROM karaoke_settings WHERE track_id = ?`)
      .get(trackId) as KaraokeSettingsRow | undefined;
    if (!row) {
      return cloneSettings(KARAOKE_DEFAULTS);
    }
    try {
      return karaokeSettingsRowToTrackSettings(row);
    } catch {
      return cloneSettings(KARAOKE_DEFAULTS);
    }
  }

  private getCurrentTrackId(): number | null {
    const row = this.db.raw
      .prepare(`SELECT current_queue_item_id FROM playback_state WHERE id = 1`)
      .get() as { current_queue_item_id: number | null };
    if (!row.current_queue_item_id) {
      return null;
    }
    const joined = this.db.raw
      .prepare(
        `SELECT t.id FROM queue_items q JOIN tracks t ON t.id = q.track_id WHERE q.id = ?`,
      )
      .get(row.current_queue_item_id) as { id: number } | undefined;
    return joined?.id ?? null;
  }

  private ensureTrackExists(trackId: number): void {
    const track = this.db.raw
      .prepare(`SELECT id FROM tracks WHERE id = ?`)
      .get(trackId) as { id: number } | undefined;
    if (!track) {
      throw new NotFoundException('Track not found');
    }
  }
}

function cloneSettings(settings: KaraokeTrackSettings): KaraokeTrackSettings {
  return {
    ...settings,
    eqBands: settings.eqBands.map((band) => ({ ...band })),
  };
}
