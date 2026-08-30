import { describe, expect, it, vi, beforeEach } from 'vitest';

const spawnCollectMock = vi.fn();
const parseFileMock = vi.fn();

vi.mock('../external/ytdlp-cli', () => ({
  spawnCollect: (...args: unknown[]) => spawnCollectMock(...args),
}));

vi.mock('music-metadata', () => ({
  parseFile: (...args: unknown[]) => parseFileMock(...args),
}));

vi.mock('./fs-timeout', () => ({
  withFsOp: (_label: string, _timeout: number, fn: () => Promise<unknown>) =>
    fn(),
}));

import { resolveReliableDurationMs } from './probe-duration';

describe('resolveReliableDurationMs', () => {
  beforeEach(() => {
    spawnCollectMock.mockReset();
    parseFileMock.mockReset();
  });

  it('returns ffprobe duration when available', async () => {
    spawnCollectMock.mockResolvedValue({
      stdout: '223.843265\n',
      stderr: '',
      code: 0,
    });

    const result = await resolveReliableDurationMs('/music/song.mp3', {
      ffprobePath: '/usr/bin/ffprobe',
      fsTimeoutMs: 5000,
      relativePath: 'song.mp3',
    });

    expect(result).toBe(223_843);
    expect(spawnCollectMock).toHaveBeenCalledWith(
      '/usr/bin/ffprobe',
      expect.arrayContaining(['-show_entries', 'format=duration', '/music/song.mp3']),
      5000,
    );
    expect(parseFileMock).not.toHaveBeenCalled();
  });

  it('falls back to music-metadata full decode when ffprobe fails', async () => {
    spawnCollectMock.mockResolvedValue({
      stdout: '',
      stderr: 'error',
      code: 1,
    });
    parseFileMock.mockResolvedValue({
      format: { duration: 95.5 },
      common: {},
    });

    const result = await resolveReliableDurationMs('/music/song.mp3', {
      ffprobePath: '/usr/bin/ffprobe',
      fsTimeoutMs: 5000,
      relativePath: 'song.mp3',
    });

    expect(result).toBe(95_500);
    expect(parseFileMock).toHaveBeenCalledWith('/music/song.mp3', {
      duration: true,
      skipCovers: true,
    });
  });

  it('returns null when both ffprobe and music-metadata fail', async () => {
    spawnCollectMock.mockRejectedValue(new Error('missing'));
    parseFileMock.mockRejectedValue(new Error('parse failed'));

    const result = await resolveReliableDurationMs('/music/song.mp3', {
      ffprobePath: '/usr/bin/ffprobe',
      fsTimeoutMs: 5000,
      relativePath: 'song.mp3',
    });

    expect(result).toBeNull();
  });

  it('skips ffprobe when the configured binary path does not exist', async () => {
    parseFileMock.mockRejectedValue(new Error('parse failed'));

    const result = await resolveReliableDurationMs('/music/song.mp3', {
      ffprobePath: '/definitely/missing/ffprobe',
      fsTimeoutMs: 5000,
      relativePath: 'song.mp3',
    });

    expect(result).toBeNull();
    expect(spawnCollectMock).not.toHaveBeenCalled();
  });
});
