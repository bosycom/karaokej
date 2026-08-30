import { describe, expect, it } from 'vitest';
import {
  assertRenderedCover,
  buildFfmpegArgs,
  buildScaleFilter,
  isCoverSize,
} from './cover-thumbnails';

describe('buildScaleFilter', () => {
  it('centre-crops square-ish artwork to fill the frame', () => {
    const filter = buildScaleFilter(128, { width: 1000, height: 1000 });
    expect(filter).toContain('force_original_aspect_ratio=increase');
    expect(filter).toContain('crop=128:128');
    expect(filter).toContain('flags=lanczos');
  });

  it('still crops moderately rectangular artwork', () => {
    const filter = buildScaleFilter(128, { width: 1200, height: 900 });
    expect(filter).toContain('crop=128:128');
  });

  it('pads instead of cropping when the aspect ratio is extreme', () => {
    const wide = buildScaleFilter(128, { width: 2400, height: 600 });
    expect(wide).toContain('force_original_aspect_ratio=decrease');
    expect(wide).toContain('pad=128:128');

    const tall = buildScaleFilter(128, { width: 600, height: 2400 });
    expect(tall).toContain('pad=128:128');
  });

  it('assumes square when dimensions are unknown', () => {
    expect(buildScaleFilter(640, null)).toContain('crop=640:640');
  });
});

describe('buildFfmpegArgs', () => {
  it('reads from stdin and writes to stdout so no paths are involved', () => {
    const args = buildFfmpegArgs(128, { width: 500, height: 500 }, 'webp');
    expect(args).toContain('pipe:0');
    expect(args[args.length - 1]).toBe('pipe:1');
    expect(args).toContain('libwebp');
    expect(args).toContain('image2');
    expect(args).not.toContain('webp');
  });

  it('falls back to mjpeg when the format is jpg', () => {
    const args = buildFfmpegArgs(640, null, 'jpg');
    expect(args).toContain('mjpeg');
    expect(args).not.toContain('libwebp');
    expect(args[args.indexOf('-f') + 1]).toBe('image2');
  });

  it('renders exactly one frame', () => {
    const args = buildFfmpegArgs(128, null, 'webp');
    expect(args[args.indexOf('-frames:v') + 1]).toBe('1');
  });
});

describe('isCoverSize', () => {
  it('accepts only the two managed sizes', () => {
    expect(isCoverSize('sm')).toBe(true);
    expect(isCoverSize('lg')).toBe(true);
    expect(isCoverSize('md')).toBe(false);
    expect(isCoverSize('')).toBe(false);
  });
});

describe('assertRenderedCover', () => {
  it('accepts webp with a self-consistent RIFF size', () => {
    const payload = Buffer.alloc(20);
    payload.write('RIFF', 0);
    payload.writeUInt32LE(12, 4);
    payload.write('WEBP', 8);
    assertRenderedCover(payload, 'webp');
  });

  it('rejects webp whose RIFF size does not match the buffer length', () => {
    const payload = Buffer.alloc(20);
    payload.write('RIFF', 0);
    payload.writeUInt32LE(0, 4);
    payload.write('WEBP', 8);
    expect(() => assertRenderedCover(payload, 'webp')).toThrow(/RIFF/);
  });

  it('accepts jpeg with SOI and EOI markers', () => {
    const payload = Buffer.from([0xff, 0xd8, 0x00, 0xff, 0xd9]);
    assertRenderedCover(payload, 'jpg');
  });
});
