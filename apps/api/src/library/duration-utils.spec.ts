import { describe, expect, it } from 'vitest';
import {
  flacDurationFromHeader,
  granuleToDurationMs,
  isOggContainerPath,
  MAX_DURATION_MS,
  mp3DurationFromHeader,
  parseOggGranuleFromTail,
  sanitizeDurationMs,
} from './duration-utils';

function makeOggPage(granule: bigint, offset = 0): Buffer {
  const buf = Buffer.alloc(offset + 27);
  buf.write('OggS', offset);
  buf[offset + 4] = 0;
  buf[offset + 5] = 0;
  const lo = Number(granule & 0xffffffffn);
  const hi = Number(granule >> 32n);
  buf.writeUInt32LE(lo, offset + 6);
  buf.writeUInt32LE(hi, offset + 10);
  return buf;
}

describe('parseOggGranuleFromTail', () => {
  it('reads granule position from the last Ogg page in a tail buffer', () => {
    const padding = Buffer.alloc(100, 0);
    const page = makeOggPage(48000n, 100);
    const buffer = Buffer.concat([padding, page]);
    expect(parseOggGranuleFromTail(buffer)).toBe(48000n);
  });

  it('returns null when no valid Ogg page is present', () => {
    expect(parseOggGranuleFromTail(Buffer.alloc(64, 0))).toBeNull();
    expect(parseOggGranuleFromTail(makeOggPage(0n))).toBeNull();
  });
});

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

describe('granuleToDurationMs', () => {
  it('converts 48 kHz granule positions to milliseconds', () => {
    expect(granuleToDurationMs(48000n)).toBe(1000);
    expect(granuleToDurationMs(96000n)).toBe(2000);
  });
});

describe('flacDurationFromHeader', () => {
  it('derives duration from STREAMINFO total samples', () => {
    const buffer = Buffer.alloc(64);
    buffer.write('fLaC', 0, 'ascii');
    buffer[4] = 0;
    buffer[5] = 0;
    buffer[6] = 0;
    buffer[7] = 34;
    const sampleRate = 44100n;
    const totalSamples = 441000n;
    const packed = (sampleRate << 44n) | (15n << 36n) | totalSamples;
    buffer.writeBigUInt64BE(packed, 18);
    expect(flacDurationFromHeader(buffer)).toBe(10000);
  });
});

describe('mp3DurationFromHeader', () => {
  it('reads frame count from a Xing header', () => {
    const buffer = Buffer.alloc(512);
    buffer.write('Xing', 200, 'latin1');
    buffer.writeUInt32BE(0x01, 204);
    buffer.writeUInt32BE(417, 208);
    const duration = mp3DurationFromHeader(buffer, 4_000_000);
    expect(duration).toBeGreaterThan(0);
  });
});

describe('isOggContainerPath', () => {
  it('matches opus and ogg extensions', () => {
    expect(isOggContainerPath('/music/track.opus')).toBe(true);
    expect(isOggContainerPath('/music/track.OGG')).toBe(true);
    expect(isOggContainerPath('/music/track.mp3')).toBe(false);
  });
});
