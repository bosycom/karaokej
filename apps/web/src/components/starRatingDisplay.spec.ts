import { describe, expect, it } from 'vitest';
import {
  contrastInk,
  formatRatingLabel,
  ratingFill,
  ratingTone,
  ratingToneColor,
  DEFAULT_RATING_COLORS,
} from './starRatingDisplay';

describe('formatRatingLabel', () => {
  it('returns empty for unrated values', () => {
    expect(formatRatingLabel(null)).toBe('');
    expect(formatRatingLabel(0)).toBe('');
  });

  it('formats whole and half stars', () => {
    expect(formatRatingLabel(2)).toBe('1');
    expect(formatRatingLabel(7)).toBe('3.5');
    expect(formatRatingLabel(10)).toBe('5');
  });
});

describe('ratingTone', () => {
  it('returns muted for unrated', () => {
    expect(ratingTone(null)).toBe('muted');
    expect(ratingTone(0)).toBe('muted');
  });

  it('maps low ratings to raspberry', () => {
    expect(ratingTone(1)).toBe('raspberry');
    expect(ratingTone(4)).toBe('raspberry');
  });

  it('maps 3-star ratings to blue', () => {
    expect(ratingTone(6)).toBe('blue');
    expect(ratingTone(5)).toBe('blue');
  });

  it('maps 4-star ratings to silver', () => {
    expect(ratingTone(8)).toBe('silver');
    expect(ratingTone(7)).toBe('silver');
  });

  it('maps perfect rating to gold', () => {
    expect(ratingTone(10)).toBe('gold');
  });
});

describe('ratingFill', () => {
  it('returns no fill for unrated', () => {
    expect(ratingFill(null)).toBe(0);
    expect(ratingFill(0)).toBe(0);
  });

  it('returns half fill for half-star ratings', () => {
    expect(ratingFill(1)).toBe(0.5);
    expect(ratingFill(9)).toBe(0.5);
  });

  it('returns full fill for whole-star ratings', () => {
    expect(ratingFill(2)).toBe(1);
    expect(ratingFill(10)).toBe(1);
  });
});

describe('ratingToneColor', () => {
  it('returns the configured swatch for each tone', () => {
    expect(ratingToneColor('gold', DEFAULT_RATING_COLORS)).toBe('#ffe08a');
    expect(ratingToneColor('silver', DEFAULT_RATING_COLORS)).toBe('#c8d0dc');
    expect(ratingToneColor('blue', DEFAULT_RATING_COLORS)).toBe('#3b82f6');
    expect(ratingToneColor('raspberry', DEFAULT_RATING_COLORS)).toBe('#e11d74');
    expect(ratingToneColor('muted', DEFAULT_RATING_COLORS)).toBeNull();
  });
});

describe('contrastInk', () => {
  it('returns dark ink on light fills', () => {
    expect(contrastInk('#ffe08a')).toBe('#111');
    expect(contrastInk('#c8d0dc')).toBe('#111');
  });

  it('returns light ink on dark fills', () => {
    expect(contrastInk('#3b82f6')).toBe('#fff');
    expect(contrastInk('#e11d74')).toBe('#fff');
  });
});
