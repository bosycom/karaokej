import { describe, expect, it, vi } from 'vitest';
import type { IAudioMetadata } from 'music-metadata';
import { resolveTrackDurationMs } from './scan-metadata';

function metaWithDuration(seconds: number | undefined): IAudioMetadata {
  return {
    format: { duration: seconds },
    common: {},
  } as IAudioMetadata;
}

describe('resolveTrackDurationMs', () => {
  it('uses header duration when music-metadata provides it', async () => {
    const parseFile = vi.fn();
    const result = await resolveTrackDurationMs(
      '/music/song.mp3',
      metaWithDuration(212.4),
      parseFile,
      5000,
      'song.mp3',
      { durationMode: 'full_fallback' },
    );
    expect(result).toEqual({ durationMs: 212400, usedFallback: false });
    expect(parseFile).not.toHaveBeenCalled();
  });

  it('falls back to duration:true parse when header and tail fail', async () => {
    const parseFile = vi.fn(async () => metaWithDuration(95.5));
    const result = await resolveTrackDurationMs(
      '/music/song.wma',
      metaWithDuration(undefined),
      parseFile,
      5000,
      'song.wma',
      { durationMode: 'full_fallback' },
    );
    expect(result).toEqual({ durationMs: 95500, usedFallback: true });
    expect(parseFile).toHaveBeenCalledWith('/music/song.wma', {
      duration: true,
      skipCovers: true,
    });
  });

  it('returns null without full decode in header_only mode', async () => {
    const parseFile = vi.fn(async () => metaWithDuration(95.5));
    const result = await resolveTrackDurationMs(
      '/music/song.wma',
      metaWithDuration(undefined),
      parseFile,
      5000,
      'song.wma',
      { durationMode: 'header_only', headerBuffer: Buffer.alloc(0), fileSize: 1000 },
    );
    expect(result).toEqual({ durationMs: null, usedFallback: false });
    expect(parseFile).not.toHaveBeenCalled();
  });

  it('uses mp3 header duration before full decode', async () => {
    const parseFile = vi.fn();
    const buffer = Buffer.alloc(512);
    buffer.write('Xing', 200, 'latin1');
    buffer.writeUInt32BE(0x01, 204);
    buffer.writeUInt32BE(417, 208);
    const result = await resolveTrackDurationMs(
      '/music/song.mp3',
      metaWithDuration(undefined),
      parseFile,
      5000,
      'song.mp3',
      {
        durationMode: 'full_fallback',
        headerBuffer: buffer,
        fileSize: 4_000_000,
      },
    );
    expect(result.usedFallback).toBe(false);
    expect(result.durationMs).toBeGreaterThan(0);
    expect(parseFile).not.toHaveBeenCalled();
  });
});
