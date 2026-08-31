export type RatingTone = 'muted' | 'raspberry' | 'blue' | 'silver' | 'gold';

export type RatingFill = 0 | 0.5 | 1;

export interface RatingColors {
  ratingGold: string;
  ratingSilver: string;
  ratingBlue: string;
  ratingRaspberry: string;
}

export const DEFAULT_RATING_COLORS: RatingColors = {
  ratingGold: '#ffe08a',
  ratingSilver: '#c8d0dc',
  ratingBlue: '#3b82f6',
  ratingRaspberry: '#e11d74',
};

/** Internal 0–10 half-star units → display label on the view star. */
export function formatRatingLabel(units: number | null): string {
  if (units == null || units <= 0) {
    return '';
  }
  const stars = units / 2;
  return Number.isInteger(stars) ? String(stars) : stars.toFixed(1);
}

/** Color tier for the view-mode star. */
export function ratingTone(units: number | null): RatingTone {
  if (units == null || units <= 0) {
    return 'muted';
  }
  switch (units) {
    case 10:
    case 9:
      return 'gold';
    case 8:
    case 7:
      return 'silver';
    case 6:
    case 5:
      return 'blue';
    default:
      return 'raspberry';
  }
}

/** Fill amount for the view-mode star (left half for .5 ratings). */
export function ratingFill(units: number | null): RatingFill {
  if (units == null || units <= 0) {
    return 0;
  }
  const stars = units / 2;
  return Number.isInteger(stars) ? 1 : 0.5;
}

export function ratingToneColor(
  tone: RatingTone,
  colors: RatingColors,
): string | null {
  switch (tone) {
    case 'gold':
      return colors.ratingGold;
    case 'silver':
      return colors.ratingSilver;
    case 'blue':
      return colors.ratingBlue;
    case 'raspberry':
      return colors.ratingRaspberry;
    default:
      return null;
  }
}

/** Pick high-contrast ink for a rating fill swatch. */
export function contrastInk(hex: string): '#111' | '#fff' {
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) {
    return '#111';
  }
  const r = Number.parseInt(normalized.slice(0, 2), 16) / 255;
  const g = Number.parseInt(normalized.slice(2, 4), 16) / 255;
  const b = Number.parseInt(normalized.slice(4, 6), 16) / 255;
  const toLinear = (channel: number) =>
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  const luminance =
    0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  return luminance > 0.55 ? '#111' : '#fff';
}

export function unitsLabel(units: number): string {
  if (units <= 0) {
    return 'Unrated';
  }
  const stars = units / 2;
  return stars === 1 ? '1 star' : `${stars} stars`;
}
