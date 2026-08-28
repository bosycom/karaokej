import { spawn } from 'node:child_process';
import {
  assertYoutubeVideoId,
  ffmpegLocationForYtdlp,
  jsRuntimeArgForYtdlp,
  pathForYtdlpExecutable,
  youtubeWatchUrl,
} from './ytdlp-path-utils';

export function jsRuntimeArgs(ytdlpPath: string, nodePath: string): string[] {
  return ['--no-js-runtimes', '--js-runtimes', jsRuntimeArgForYtdlp(ytdlpPath, nodePath)];
}

export function buildYoutubeSearchArgs(
  query: string,
  ytdlpPath: string,
  nodePath: string,
): string[] {
  const trimmed = query.trim();
  return [
    `ytsearch5:${trimmed}`,
    '--flat-playlist',
    '--dump-json',
    '--skip-download',
    '--no-playlist',
    '--ignore-config',
    ...jsRuntimeArgs(ytdlpPath, nodePath),
  ];
}

export function buildYoutubeDownloadArgs(
  ytdlpPath: string,
  ffmpegPath: string,
  outputDir: string,
  videoId: string,
  audioFormat: string,
  nodePath: string,
): string[] {
  const id = assertYoutubeVideoId(videoId);
  const outDir = pathForYtdlpExecutable(ytdlpPath, outputDir);
  const ffmpegLoc = ffmpegLocationForYtdlp(ytdlpPath, ffmpegPath);
  return [
    '-x',
    '--audio-format',
    audioFormat,
    '--audio-quality',
    '0',
    '--ffmpeg-location',
    ffmpegLoc,
    '-o',
    `${outDir}/%(title)s [%(id)s].%(ext)s`,
    '--restrict-filenames',
    '--no-playlist',
    '--ignore-config',
    ...jsRuntimeArgs(ytdlpPath, nodePath),
    youtubeWatchUrl(id),
  ];
}

export function spawnCollect(
  executable: string,
  args: string[],
  timeoutMs = 120_000,
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error('yt-dlp timed out'));
    }, timeoutMs);
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code });
    });
  });
}
