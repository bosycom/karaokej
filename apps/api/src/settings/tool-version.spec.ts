import { describe, expect, it } from 'vitest';
import { firstVersionLine } from './tool-version';

describe('firstVersionLine', () => {
  it('returns the first non-empty line from stdout or stderr', () => {
    expect(
      firstVersionLine('ffmpeg version 6.0\nbuilt with gcc', 'ignored'),
    ).toBe('ffmpeg version 6.0');
    expect(firstVersionLine('', 'yt-dlp 2024.08.01')).toBe('yt-dlp 2024.08.01');
    expect(firstVersionLine('\n\n', '')).toBeNull();
  });
});
