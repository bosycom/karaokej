import { describe, expect, it } from 'vitest';
import {
  KARAOKE_DEFAULTS,
  normalizeKaraokeSettings,
  parseEqBands,
  serializeEqBands,
} from '@karaokej/shared';

describe('normalizeKaraokeSettings', () => {
  it('returns defaults for empty input', () => {
    const { settings, errors } = normalizeKaraokeSettings({});
    expect(errors).toEqual([]);
    expect(settings.centerAmount).toBe(KARAOKE_DEFAULTS.centerAmount);
    expect(settings.eqBands).toHaveLength(3);
  });

  it('accepts valid settings', () => {
    const { settings, errors } = normalizeKaraokeSettings({
      centerAmount: 0.5,
      bassRetainHz: 200,
      trebleRetainHz: 8000,
      makeupGainDb: 2,
      eqBands: [{ frequency: 500, gain: -3, q: 1.5 }],
    });
    expect(errors).toEqual([]);
    expect(settings.centerAmount).toBe(0.5);
    expect(settings.eqBands).toEqual([{ frequency: 500, gain: -3, q: 1.5 }]);
  });

  it('rejects out-of-range centerAmount', () => {
    const { errors } = normalizeKaraokeSettings({ centerAmount: 2 });
    expect(errors.some((e) => e.includes('centerAmount'))).toBe(true);
  });

  it('rejects invalid eq band frequency', () => {
    const { errors } = normalizeKaraokeSettings({
      eqBands: [{ frequency: -1, gain: 0, q: 1 }],
    });
    expect(errors.some((e) => e.includes('eqBands'))).toBe(true);
  });

  it('rejects too many eq bands', () => {
    const bands = Array.from({ length: 9 }, (_, i) => ({
      frequency: 100 + i * 100,
      gain: 0,
      q: 1,
    }));
    const { errors } = normalizeKaraokeSettings({ eqBands: bands });
    expect(errors.some((e) => e.includes('at most'))).toBe(true);
  });
});

describe('parseEqBands / serializeEqBands', () => {
  it('round-trips eq bands', () => {
    const bands = [{ frequency: 250, gain: -1.5, q: 1 }];
    const json = serializeEqBands(bands);
    expect(parseEqBands(JSON.parse(json))).toEqual(bands);
  });

  it('falls back to defaults for malformed input', () => {
    const bands = parseEqBands('not-json');
    expect(bands).toHaveLength(KARAOKE_DEFAULTS.eqBands.length);
  });
});
