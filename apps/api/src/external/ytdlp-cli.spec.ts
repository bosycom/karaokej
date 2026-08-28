import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  buildYoutubeDownloadArgs,
  buildYoutubeSearchArgs,
} from './ytdlp-cli';

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}));

function mockWslpath(map: Record<string, string>): void {
  vi.mocked(spawnSync).mockImplementation((cmd, args) => {
    if (cmd !== 'wslpath' || !Array.isArray(args) || args[0] !== '-w') {
      return { status: 1, stdout: '', stderr: '', pid: 0, output: [] };
    }
    const wslPath = String(args[1]);
    const winPath = map[wslPath];
    if (!winPath) {
      return { status: 1, stdout: '', stderr: 'not found', pid: 0, output: [] };
    }
    return { status: 0, stdout: `${winPath}\n`, stderr: '', pid: 0, output: [] };
  });
}

describe('buildYoutubeSearchArgs', () => {
  const ytdlp = '/mnt/c/Program Files/yt-dlp/yt-dlp.exe';
  const nodePath = '/mnt/c/Program Files/nodejs/node.exe';

  beforeEach(() => {
    mockWslpath({
      '/mnt/c/Program Files/nodejs/node.exe': 'C:\\Program Files\\nodejs\\node.exe',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('includes ytsearch5 selector, Node JS runtime, and no shell flags', () => {
    expect(buildYoutubeSearchArgs('hello world', ytdlp, nodePath)).toEqual([
      'ytsearch5:hello world',
      '--flat-playlist',
      '--dump-json',
      '--skip-download',
      '--no-playlist',
      '--ignore-config',
      '--no-js-runtimes',
      '--js-runtimes',
      'node:C:\\Program Files\\nodejs\\node.exe',
    ]);
  });

  it('trims the query', () => {
    expect(buildYoutubeSearchArgs('  trim me  ', ytdlp, nodePath)[0]).toBe(
      'ytsearch5:trim me',
    );
  });
});

describe('buildYoutubeDownloadArgs', () => {
  const ytdlp = '/mnt/c/Program Files/yt-dlp/yt-dlp.exe';
  const ffmpeg = '/mnt/c/Program Files/YT Saver/ffmpeg.exe';
  const outputDir = '/mnt/a/Music/Downloads';
  const nodePath = '/mnt/c/Program Files/nodejs/node.exe';

  beforeEach(() => {
    mockWslpath({
      '/mnt/a/Music/Downloads': 'D:\\Audio\\Music\\Downloads',
      '/mnt/c/Program Files/YT Saver/ffmpeg.exe':
        'C:\\Program Files\\YT Saver\\ffmpeg.exe',
      '/mnt/c/Program Files/nodejs/node.exe': 'C:\\Program Files\\nodejs\\node.exe',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('builds mp3 extraction args with constructed watch URL only', () => {
    const args = buildYoutubeDownloadArgs(
      ytdlp,
      ffmpeg,
      outputDir,
      'dQw4w9WgXcQ',
      'mp3',
      nodePath,
    );
    expect(args).toContain('-x');
    expect(args).toContain('--audio-format');
    expect(args[args.indexOf('--audio-format') + 1]).toBe('mp3');
    expect(args.at(-1)).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(args).toContain('C:\\Program Files\\YT Saver\\ffmpeg.exe');
    expect(args).toContain(
      'D:\\Audio\\Music\\Downloads/%(title)s [%(id)s].%(ext)s',
    );
    expect(args).toContain('--no-js-runtimes');
    expect(args).toContain('--js-runtimes');
    expect(args[args.indexOf('--js-runtimes') + 1]).toBe(
      'node:C:\\Program Files\\nodejs\\node.exe',
    );
  });

  it('rejects invalid video IDs', () => {
    expect(() =>
      buildYoutubeDownloadArgs(ytdlp, ffmpeg, outputDir, 'bad-id', 'mp3', nodePath),
    ).toThrow('Invalid YouTube video ID');
  });
});
