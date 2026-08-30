import { describe, expect, it } from 'vitest';
import { formatRatingLabel, ratingTone } from './starRatingDisplay';

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

  it('maps low ratings to grey', () => {
    expect(ratingTone(1)).toBe('grey');
    expect(ratingTone(5)).toBe('grey');
  });

  it('maps mid ratings to bronze', () => {
    expect(ratingTone(6)).toBe('bronze');
    expect(ratingTone(7)).toBe('bronze');
  });

  it('maps high ratings to silver', () => {
    expect(ratingTone(8)).toBe('silver');
    expect(ratingTone(9)).toBe('silver');
  });

  it('maps perfect rating to gold', () => {
    expect(ratingTone(10)).toBe('gold');
  });
});
