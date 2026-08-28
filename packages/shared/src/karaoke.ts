export type KaraokeMode = 'off' | 'vocal-reduction' | 'ai';

export type AiProcessingStatus =
  | 'none'
  | 'pending'
  | 'processing'
  | 'ready'
  | 'failed'
  | 'unsupported';

export interface KaraokeEqBand {
  frequency: number;
  gain: number;
  q: number;
}

export interface KaraokeTrackSettings {
  centerAmount: number;
  bassRetainHz: number;
  trebleRetainHz: number;
  makeupGainDb: number;
  eqBands: KaraokeEqBand[];
}

export interface KaraokeSettingsDto extends KaraokeTrackSettings {
  trackId: number;
  isDefault: boolean;
  updatedAt: string | null;
}

export interface KaraokeStemDto {
  trackId: number;
  status: AiProcessingStatus;
  url: string | null;
  model: string | null;
  modelVersion: string | null;
  processedAt: string | null;
  error: string | null;
}

export interface KaraokeStateDto {
  mode: KaraokeMode;
  /** Current track's live tuning (unsaved tweaks or saved settings). */
  live: KaraokeTrackSettings;
  /** Whether live values match persisted settings for the current track. */
  isDefault: boolean;
  /** Track id live settings apply to, or null when nothing is playing. */
  trackId: number | null;
  /** AI instrumental stem for the current track, if any. */
  stem: KaraokeStemDto | null;
}

export const KARAOKE_MODES: readonly KaraokeMode[] = [
  'off',
  'vocal-reduction',
  'ai',
] as const;

export const KARAOKE_DEFAULT_EQ_BANDS: readonly KaraokeEqBand[] = [
  { frequency: 250, gain: 0, q: 1 },
  { frequency: 1000, gain: 0, q: 1.2 },
  { frequency: 3000, gain: 0, q: 1.4 },
] as const;

export const KARAOKE_DEFAULTS: KaraokeTrackSettings = {
  centerAmount: 0.8,
  bassRetainHz: 180,
  trebleRetainHz: 9000,
  makeupGainDb: 0,
  eqBands: KARAOKE_DEFAULT_EQ_BANDS.map((band) => ({ ...band })),
};

export const KARAOKE_LIMITS = {
  centerAmount: { min: 0, max: 1 },
  frequency: { min: 20, max: 20000 },
  gainDb: { min: -24, max: 24 },
  q: { min: 0.1, max: 18 },
  maxEqBands: 8,
} as const;

export function isKaraokeMode(value: unknown): value is KaraokeMode {
  return (
    typeof value === 'string' &&
    (KARAOKE_MODES as readonly string[]).includes(value)
  );
}

export function isAiProcessingStatus(value: unknown): value is AiProcessingStatus {
  return (
    typeof value === 'string' &&
    ['none', 'pending', 'processing', 'ready', 'failed', 'unsupported'].includes(
      value,
    )
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeEqBand(raw: unknown): KaraokeEqBand | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const band = raw as Record<string, unknown>;
  if (
    !isFiniteNumber(band.frequency) ||
    !isFiniteNumber(band.gain) ||
    !isFiniteNumber(band.q)
  ) {
    return null;
  }
  if (
    band.frequency < KARAOKE_LIMITS.frequency.min ||
    band.frequency > KARAOKE_LIMITS.frequency.max ||
    band.gain < KARAOKE_LIMITS.gainDb.min ||
    band.gain > KARAOKE_LIMITS.gainDb.max ||
    band.q < KARAOKE_LIMITS.q.min ||
    band.q > KARAOKE_LIMITS.q.max
  ) {
    return null;
  }
  return {
    frequency: band.frequency,
    gain: band.gain,
    q: band.q,
  };
}

export function parseEqBands(raw: unknown): KaraokeEqBand[] {
  if (!Array.isArray(raw)) {
    return KARAOKE_DEFAULTS.eqBands.map((band) => ({ ...band }));
  }
  const bands = raw
    .map(normalizeEqBand)
    .filter((band): band is KaraokeEqBand => band != null)
    .slice(0, KARAOKE_LIMITS.maxEqBands);
  if (bands.length === 0) {
    return KARAOKE_DEFAULTS.eqBands.map((band) => ({ ...band }));
  }
  return bands;
}

export function serializeEqBands(bands: KaraokeEqBand[]): string {
  return JSON.stringify(
    bands.map((band) => ({
      frequency: band.frequency,
      gain: band.gain,
      q: band.q,
    })),
  );
}

export interface NormalizeKaraokeSettingsResult {
  settings: KaraokeTrackSettings;
  errors: string[];
}

export function normalizeKaraokeSettings(
  raw: unknown,
): NormalizeKaraokeSettingsResult {
  const errors: string[] = [];
  const input =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};

  const centerAmount = isFiniteNumber(input.centerAmount)
    ? clamp(
        input.centerAmount,
        KARAOKE_LIMITS.centerAmount.min,
        KARAOKE_LIMITS.centerAmount.max,
      )
    : KARAOKE_DEFAULTS.centerAmount;
  if (
    !isFiniteNumber(input.centerAmount) ||
    input.centerAmount < KARAOKE_LIMITS.centerAmount.min ||
    input.centerAmount > KARAOKE_LIMITS.centerAmount.max
  ) {
    if (input.centerAmount !== undefined) {
      errors.push('centerAmount must be between 0 and 1');
    }
  }

  const bassRetainHz = isFiniteNumber(input.bassRetainHz)
    ? clamp(
        input.bassRetainHz,
        KARAOKE_LIMITS.frequency.min,
        KARAOKE_LIMITS.frequency.max,
      )
    : KARAOKE_DEFAULTS.bassRetainHz;
  if (
    input.bassRetainHz !== undefined &&
    (!isFiniteNumber(input.bassRetainHz) ||
      input.bassRetainHz < KARAOKE_LIMITS.frequency.min ||
      input.bassRetainHz > KARAOKE_LIMITS.frequency.max)
  ) {
    errors.push('bassRetainHz must be between 20 and 20000');
  }

  const trebleRetainHz = isFiniteNumber(input.trebleRetainHz)
    ? clamp(
        input.trebleRetainHz,
        KARAOKE_LIMITS.frequency.min,
        KARAOKE_LIMITS.frequency.max,
      )
    : KARAOKE_DEFAULTS.trebleRetainHz;
  if (
    input.trebleRetainHz !== undefined &&
    (!isFiniteNumber(input.trebleRetainHz) ||
      input.trebleRetainHz < KARAOKE_LIMITS.frequency.min ||
      input.trebleRetainHz > KARAOKE_LIMITS.frequency.max)
  ) {
    errors.push('trebleRetainHz must be between 20 and 20000');
  }

  const makeupGainDb = isFiniteNumber(input.makeupGainDb)
    ? clamp(
        input.makeupGainDb,
        KARAOKE_LIMITS.gainDb.min,
        KARAOKE_LIMITS.gainDb.max,
      )
    : KARAOKE_DEFAULTS.makeupGainDb;
  if (
    input.makeupGainDb !== undefined &&
    (!isFiniteNumber(input.makeupGainDb) ||
      input.makeupGainDb < KARAOKE_LIMITS.gainDb.min ||
      input.makeupGainDb > KARAOKE_LIMITS.gainDb.max)
  ) {
    errors.push('makeupGainDb must be between -24 and 24');
  }

  let eqBands = KARAOKE_DEFAULTS.eqBands.map((band) => ({ ...band }));
  if (input.eqBands !== undefined) {
    if (!Array.isArray(input.eqBands)) {
      errors.push('eqBands must be an array');
    } else if (input.eqBands.length > KARAOKE_LIMITS.maxEqBands) {
      errors.push(`eqBands may contain at most ${KARAOKE_LIMITS.maxEqBands} bands`);
    } else {
      const parsed = input.eqBands
        .map(normalizeEqBand)
        .filter((band): band is KaraokeEqBand => band != null);
      if (parsed.length !== input.eqBands.length) {
        errors.push('eqBands contains invalid band values');
      }
      if (parsed.length > 0) {
        eqBands = parsed;
      }
    }
  }

  return {
    settings: {
      centerAmount,
      bassRetainHz,
      trebleRetainHz,
      makeupGainDb,
      eqBands,
    },
    errors,
  };
}

export function karaokeTrackSettingsEqual(
  a: KaraokeTrackSettings,
  b: KaraokeTrackSettings,
): boolean {
  return (
    a.centerAmount === b.centerAmount &&
    a.bassRetainHz === b.bassRetainHz &&
    a.trebleRetainHz === b.trebleRetainHz &&
    a.makeupGainDb === b.makeupGainDb &&
    a.eqBands.length === b.eqBands.length &&
    a.eqBands.every(
      (band, index) =>
        band.frequency === b.eqBands[index]?.frequency &&
        band.gain === b.eqBands[index]?.gain &&
        band.q === b.eqBands[index]?.q,
    )
  );
}

export function defaultKaraokeState(): KaraokeStateDto {
  return {
    mode: 'off',
    live: {
      ...KARAOKE_DEFAULTS,
      eqBands: KARAOKE_DEFAULTS.eqBands.map((band) => ({ ...band })),
    },
    isDefault: true,
    trackId: null,
    stem: null,
  };
}
