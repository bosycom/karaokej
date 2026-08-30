import { existsSync } from 'node:fs';
import { spawnCollect } from '../external/ytdlp-cli';
import { withFsOp } from './fs-timeout';
import { sanitizeDurationMs } from './duration-utils';

export interface ResolveReliableDurationOptions {
  ffprobePath: string;
  fsTimeoutMs: number;
  relativePath?: string;
}

function ffprobeAvailable(ffprobePath: string): boolean {
  if (ffprobePath.includes('/') || ffprobePath.includes('\\')) {
    return existsSync(ffprobePath);
  }
  return true;
}

async function durationFromFfprobe(
  absolutePath: string,
  ffprobePath: string,
  fsTimeoutMs: number,
): Promise<number | null> {
  if (!ffprobeAvailable(ffprobePath)) {
    return null;
  }
  try {
    const { stdout, code } = await spawnCollect(
      ffprobePath,
      [
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-of',
        'default=noprint_wrappers=1:nokey=1',
        absolutePath,
      ],
      fsTimeoutMs,
    );
    if (code !== 0) {
      return null;
    }
    const seconds = Number.parseFloat(stdout.trim());
    if (!Number.isFinite(seconds) || seconds <= 0) {
      return null;
    }
    return sanitizeDurationMs(seconds * 1000);
  } catch {
    return null;
  }
}

async function durationFromMusicMetadata(
  absolutePath: string,
  fsTimeoutMs: number,
  label: string,
): Promise<number | null> {
  try {
    const { parseFile } = await import('music-metadata');
    const meta = await withFsOp(`parse ${label}`, fsTimeoutMs, () =>
      parseFile(absolutePath, { duration: true, skipCovers: true }),
    );
    const duration = meta.format.duration;
    if (duration == null || duration <= 0) {
      return null;
    }
    return sanitizeDurationMs(duration * 1000);
  } catch {
    return null;
  }
}

export async function resolveReliableDurationMs(
  absolutePath: string,
  options: ResolveReliableDurationOptions,
): Promise<number | null> {
  const label = options.relativePath ?? absolutePath;
  const fromProbe = await durationFromFfprobe(
    absolutePath,
    options.ffprobePath,
    options.fsTimeoutMs,
  );
  if (fromProbe != null) {
    return fromProbe;
  }
  return durationFromMusicMetadata(absolutePath, options.fsTimeoutMs, label);
}
