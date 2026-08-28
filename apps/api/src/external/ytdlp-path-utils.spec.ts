import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  assertYoutubeVideoId,
  ffmpegLocationForYtdlp,
  jsRuntimeArgForYtdlp,
  pathForYtdlpExecutable,
  toWindowsPath,
  wslToWinPath,
  YOUTUBE_VIDEO_ID,
} from './ytdlp-path-utils';

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}));

function mockWslpath(map: Record<string, string>): void {
  vi.mocked(spawnSync).mockImplementation((cmd, args) => {
    if (cmd !== 'wslpath' || !Array.isArray(args) || args[0] !== '-w') {
      return { status: 1, stdout: '', stderr: '', pid: 0, output: [], signal: null };
    }
    const wslPath = String(args[1]);
    const winPath = map[wslPath];
    if (!winPath) {
      return { status: 1, stdout: '', stderr: 'not found', pid: 0, output: [], signal: null };
    }
    return { status: 0, stdout: `${winPath}\n`, stderr: '', pid: 0, output: [], signal: null };
  });
}

describe('wslToWinPath', () => {
  it('converts /mnt/c paths to Windows drive paths', () => {
    expect(wslToWinPath('/mnt/c/Program Files/yt-dlp/yt-dlp.exe')).toBe(
      'C:\\Program Files\\yt-dlp\\yt-dlp.exe',
    );
  });

  it('leaves non-WSL paths unchanged', () => {
    expect(wslToWinPath('/usr/bin/ffmpeg')).toBe('/usr/bin/ffmpeg');
  });
});

describe('toWindowsPath', () => {
  beforeEach(() => {
    vi.mocked(spawnSync).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses wslpath -w when available', () => {
    mockWslpath({
      '/mnt/a/Music/Downloads': 'D:\\Audio\\Music\\Downloads',
    });
    expect(toWindowsPath('/mnt/a/Music/Downloads')).toBe(
      'D:\\Audio\\Music\\Downloads',
    );
    expect(spawnSync).toHaveBeenCalledWith('wslpath', ['-w', '/mnt/a/Music/Downloads'], {
      encoding: 'utf8',
    });
  });

  it('falls back to naive mapping when wslpath fails', () => {
    vi.mocked(spawnSync).mockReturnValue({
      status: 1,
      stdout: '',
      stderr: 'missing',
      pid: 0,
      output: [],
      signal: null,
    });
    expect(toWindowsPath('/mnt/c/Program Files/yt-dlp/yt-dlp.exe')).toBe(
      'C:\\Program Files\\yt-dlp\\yt-dlp.exe',
    );
  });
});

describe('pathForYtdlpExecutable', () => {
  beforeEach(() => {
    vi.mocked(spawnSync).mockReset();
    mockWslpath({
      '/mnt/a/Music/Downloads': 'D:\\Audio\\Music\\Downloads',
      '/mnt/c/Program Files/yt-dlp/yt-dlp.exe': 'C:\\Program Files\\yt-dlp\\yt-dlp.exe',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses wslpath-resolved Windows paths for .exe yt-dlp', () => {
    expect(
      pathForYtdlpExecutable(
        '/mnt/c/Program Files/yt-dlp/yt-dlp.exe',
        '/mnt/a/Music/Downloads',
      ),
    ).toBe('D:\\Audio\\Music\\Downloads');
  });

  it('leaves WSL paths unchanged for native yt-dlp', () => {
    expect(pathForYtdlpExecutable('/usr/bin/yt-dlp', '/mnt/a/Music/Downloads')).toBe(
      '/mnt/a/Music/Downloads',
    );
    expect(spawnSync).not.toHaveBeenCalled();
  });
});

describe('jsRuntimeArgForYtdlp', () => {
  beforeEach(() => {
    vi.mocked(spawnSync).mockReset();
    mockWslpath({
      '/mnt/c/Program Files/nodejs/node.exe': 'C:\\Program Files\\nodejs\\node.exe',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('points Windows yt-dlp at a Windows node.exe', () => {
    expect(
      jsRuntimeArgForYtdlp(
        '/mnt/c/Program Files/yt-dlp/yt-dlp.exe',
        '/mnt/c/Program Files/nodejs/node.exe',
      ),
    ).toBe('node:C:\\Program Files\\nodejs\\node.exe');
  });
});

describe('ffmpegLocationForYtdlp', () => {
  beforeEach(() => {
    vi.mocked(spawnSync).mockReset();
    mockWslpath({
      '/mnt/c/Program Files/YT Saver/ffmpeg.exe':
        'C:\\Program Files\\YT Saver\\ffmpeg.exe',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('points Windows yt-dlp at a Windows ffmpeg path', () => {
    expect(
      ffmpegLocationForYtdlp(
        '/mnt/c/Program Files/yt-dlp/yt-dlp.exe',
        '/mnt/c/Program Files/YT Saver/ffmpeg.exe',
      ),
    ).toBe('C:\\Program Files\\YT Saver\\ffmpeg.exe');
  });
});

describe('assertYoutubeVideoId', () => {
  it('accepts valid 11-character IDs', () => {
    expect(assertYoutubeVideoId('dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('rejects invalid IDs', () => {
    expect(() => assertYoutubeVideoId('short')).toThrow('Invalid YouTube video ID');
    expect(() => assertYoutubeVideoId('bad/id/here!!')).toThrow();
    expect(YOUTUBE_VIDEO_ID.test('dQw4w9WgXcQ')).toBe(true);
  });
});
