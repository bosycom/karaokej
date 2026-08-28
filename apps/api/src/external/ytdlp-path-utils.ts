import { spawnSync } from 'node:child_process';

/** Convert WSL /mnt/c/... paths to C:\... (naive fallback when wslpath is unavailable). */
export function wslToWinPath(wslPath: string): string {
  const match = /^\/mnt\/([a-z])\/(.*)$/i.exec(wslPath);
  if (!match) {
    return wslPath;
  }
  const drive = match[1]!.toUpperCase();
  const rest = match[2]!.replace(/\//g, '\\');
  return `${drive}:\\${rest}`;
}

/** Resolve a WSL path to its real Windows path (handles custom drvfs mounts like /mnt/a -> D:\\Audio). */
export function toWindowsPath(wslPath: string): string {
  const result = spawnSync('wslpath', ['-w', wslPath], { encoding: 'utf8' });
  const stdout = result.stdout?.trim();
  if (result.status === 0 && stdout) {
    return stdout;
  }
  return wslToWinPath(wslPath);
}

export function pathForYtdlpExecutable(ytdlpPath: string, wslPath: string): string {
  if (ytdlpPath.toLowerCase().endsWith('.exe')) {
    return toWindowsPath(wslPath);
  }
  return wslPath;
}

export function ffmpegLocationForYtdlp(
  ytdlpPath: string,
  ffmpegPath: string,
): string {
  return pathForYtdlpExecutable(ytdlpPath, ffmpegPath);
}

export function jsRuntimeArgForYtdlp(
  ytdlpPath: string,
  nodePath: string,
): string {
  return `node:${pathForYtdlpExecutable(ytdlpPath, nodePath)}`;
}

export const YOUTUBE_VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

export function assertYoutubeVideoId(videoId: string): string {
  const trimmed = videoId.trim();
  if (!YOUTUBE_VIDEO_ID.test(trimmed)) {
    throw new Error('Invalid YouTube video ID');
  }
  return trimmed;
}

export function youtubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}
