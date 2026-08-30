export type RatingTone = 'muted' | 'grey' | 'bronze' | 'silver' | 'gold';

/** Internal 0–10 half-star units → display label on the view star. */
export function formatRatingLabel(units: number | null): string {
  if (units == null || units <= 0) {
    return '';
  }
  const stars = units / 2;
  return Number.isInteger(stars) ? String(stars) : stars.toFixed(1);
}

/** Color tier for the view-mode star (0.5–2.5 grey, 3–3.5 bronze, 4–4.5 silver, 5 gold). */
export function ratingTone(units: number | null): RatingTone {
  if (units == null || units <= 0) {
    return 'muted';
  }
  const stars = units / 2;
  if (stars >= 5) {
    return 'gold';
  }
  if (stars >= 4) {
    return 'silver';
  }
  if (stars >= 3) {
    return 'bronze';
  }
  return 'grey';
}

export function unitsLabel(units: number): string {
  if (units <= 0) {
    return 'Unrated';
  }
  const stars = units / 2;
  return stars === 1 ? '1 star' : `${stars} stars`;
}
