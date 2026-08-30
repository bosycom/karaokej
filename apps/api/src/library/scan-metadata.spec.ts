import { describe, expect, it, vi } from 'vitest';
import * as durationUtils from './duration-utils';
import * as fsTimeout from './fs-timeout';
import { readTrackMetadata } from './scan-metadata';

vi.mock('music-metadata', () => ({
  parseBuffer: vi.fn(async () => ({
    format: { duration: 212.4 },
    common: {
      title: 'Test Song',
      artist: 'Test Artist',
      album: 'Test Album',
    },
  })),
}));

describe('readTrackMetadata', () => {
  it('reads tags from header but stores null duration', async () => {
    vi.spyOn(durationUtils, 'readAudioHeaderBuffer').mockResolvedValue({
      buffer: Buffer.alloc(1024),
      fileSize: 4_000_000,
    });
    vi.spyOn(fsTimeout, 'withFsOp').mockImplementation((_label, _timeout, fn) =>
      fn(),
    );

    const result = await readTrackMetadata('/music/song.mp3', 'song.mp3', {
      fsTimeoutMs: 5000,
    });

    expect(result.metadata.title).toBe('Test Song');
    expect(result.metadata.artist).toBe('Test Artist');
    expect(result.metadata.durationMs).toBeNull();
  });
});
