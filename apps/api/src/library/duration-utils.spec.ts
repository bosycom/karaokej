import { describe, expect, it } from 'vitest';
import { MAX_DURATION_MS, sanitizeDurationMs } from './duration-utils';

describe('sanitizeDurationMs', () => {
  it('accepts normal song lengths', () => {
    expect(sanitizeDurationMs(149_120)).toBe(149_120);
    expect(sanitizeDurationMs(149_120.7)).toBe(149_121);
  });

  it('rejects zero, NaN, and non-finite values', () => {
    expect(sanitizeDurationMs(0)).toBeNull();
    expect(sanitizeDurationMs(-1)).toBeNull();
    expect(sanitizeDurationMs(Number.NaN)).toBeNull();
    expect(sanitizeDurationMs(Number.POSITIVE_INFINITY)).toBeNull();
    expect(sanitizeDurationMs(null)).toBeNull();
    expect(sanitizeDurationMs(undefined)).toBeNull();
  });

  it('rejects the live Opus sentinel and values above the cap', () => {
    expect(sanitizeDurationMs(384307168202282304)).toBeNull();
    expect(sanitizeDurationMs(MAX_DURATION_MS + 1)).toBeNull();
  });

  it('accepts durations up to the karaoke cap', () => {
    expect(sanitizeDurationMs(MAX_DURATION_MS)).toBe(MAX_DURATION_MS);
  });
});
