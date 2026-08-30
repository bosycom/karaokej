import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  cleanYoutubeDownloadBasename,
  resolveUniqueDownloadBasename,
} from './youtube-download-name';

describe('cleanYoutubeDownloadBasename', () => {
  it('cleans the Umbrella example from the plan', () => {
    expect(
      cleanYoutubeDownloadBasename(
        'Rihanna_-_Umbrella_Lyrics_ft._JAY-Z [EPtrQpx9VDw].mp3',
      ),
    ).toBe('Rihanna - Umbrella ft. JAY-Z.mp3');
  });

  it('replaces underscores with spaces and strips the video id suffix', () => {
    expect(
      cleanYoutubeDownloadBasename('Artist_-_Song_Title [dQw4w9WgXcQ].mp3'),
    ).toBe('Artist - Song Title.mp3');
  });

  it('removes parenthetical Lyrics markers', () => {
    expect(
      cleanYoutubeDownloadBasename('Artist - Song (Lyrics) [abc12345678].mp3'),
    ).toBe('Artist - Song.mp3');
  });

  it('removes bracketed Lyrics markers', () => {
    expect(
      cleanYoutubeDownloadBasename('Artist - Song [Lyrics] [abc12345678].mp3'),
    ).toBe('Artist - Song.mp3');
  });

  it('removes standalone Lyrics between title parts', () => {
    expect(
      cleanYoutubeDownloadBasename('Artist - Song Lyrics ft. Guest [abc12345678].mp3'),
    ).toBe('Artist - Song ft. Guest.mp3');
  });

  it('removes Lyric Video phrase', () => {
    expect(
      cleanYoutubeDownloadBasename(
        'Artist - Song Lyric Video [abc12345678].mp3',
      ),
    ).toBe('Artist - Song.mp3');
  });

  it('keeps Lyrics when it is the entire title', () => {
    expect(cleanYoutubeDownloadBasename('Lyrics [abc12345678].mp3')).toBe(
      'Lyrics.mp3',
    );
  });

  it('does not title-case artist names', () => {
    expect(
      cleanYoutubeDownloadBasename('RIHANNA_-_UMBRELLA_ft._JAY-Z [abc12345678].mp3'),
    ).toBe('RIHANNA - UMBRELLA ft. JAY-Z.mp3');
  });

  it('preserves files without a video id suffix', () => {
    expect(cleanYoutubeDownloadBasename('Artist_-_Title.mp3')).toBe(
      'Artist - Title.mp3',
    );
  });
});

describe('resolveUniqueDownloadBasename', () => {
  let downloadsDir: string;

  beforeEach(() => {
    downloadsDir = mkdtempSync(join(tmpdir(), 'karaokej-download-name-'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the candidate when the path is free', () => {
    expect(
      resolveUniqueDownloadBasename(downloadsDir, 'Artist - Title.mp3'),
    ).toBe('Artist - Title.mp3');
  });

  it('appends numeric suffixes when the cleaned name already exists', () => {
    writeFileSync(join(downloadsDir, 'Artist - Title.mp3'), 'one');
    expect(
      resolveUniqueDownloadBasename(downloadsDir, 'Artist - Title.mp3'),
    ).toBe('Artist - Title (2).mp3');
  });

  it('ignores the file being renamed when checking collisions', () => {
    writeFileSync(
      join(downloadsDir, 'Rihanna_-_Umbrella [abc12345678].mp3'),
      'one',
    );
    expect(
      resolveUniqueDownloadBasename(
        downloadsDir,
        'Rihanna - Umbrella.mp3',
        'Rihanna_-_Umbrella [abc12345678].mp3',
      ),
    ).toBe('Rihanna - Umbrella.mp3');
  });
});
