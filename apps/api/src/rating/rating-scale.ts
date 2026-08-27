/** Internal rating is 0–10, where each unit is half a star. */

export const POPM_EMAIL = 'Windows Media Player 9 Series';

/** WMP/MediaMonkey 11-state write table: internal units → POPM byte. */
const INTERNAL_TO_POPM = [0, 13, 1, 54, 64, 118, 128, 186, 196, 242, 255] as const;

export function clampRating(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(10, Math.max(0, Math.round(value)));
}

export function isRating(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 10
  );
}

export function internalToPopm(rating: number): number {
  return INTERNAL_TO_POPM[clampRating(rating)];
}

export function popmToInternal(popm: number): number {
  if (!Number.isFinite(popm)) {
    return 0;
  }
  const byte = Math.min(255, Math.max(0, Math.round(popm)));
  let best = 0;
  let bestDist = Math.abs(INTERNAL_TO_POPM[0] - byte);
  for (let i = 1; i < INTERNAL_TO_POPM.length; i += 1) {
    const dist = Math.abs(INTERNAL_TO_POPM[i] - byte);
    if (dist < bestDist) {
      best = i;
      bestDist = dist;
    }
  }
  return best;
}

export function parseVorbisRating(raw: string): number | null {
  const n = Number.parseFloat(raw.trim());
  if (!Number.isFinite(n) || n < 0) {
    return null;
  }
  if (n > 10 && n <= 100) {
    return clampRating(n / 10);
  }
  if (n > 100) {
    return null;
  }
  if (
    n <= 5 &&
    !Number.isInteger(n) &&
    Math.abs(n * 2 - Math.round(n * 2)) < 1e-6
  ) {
    return clampRating(n * 2);
  }
  return clampRating(n);
}

export function parseFmpsRating(raw: string): number | null {
  const n = Number.parseFloat(raw.trim());
  if (!Number.isFinite(n) || n < 0) {
    return null;
  }
  if (n <= 1) {
    return clampRating(n * 10);
  }
  return parseVorbisRating(raw);
}
