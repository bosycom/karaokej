import { spawn, type ChildProcess } from 'node:child_process';
import { basename, join } from 'node:path';

export interface BuildDemucsArgsInput {
  model: string;
  inputPath: string;
  outputDir: string;
  extraArgs?: string[];
}

export function buildDemucsArgs(input: BuildDemucsArgsInput): string[] {
  return [
    '--two-stems',
    'vocals',
    '--mp3',
    '--mp3-bitrate',
    '256',
    '-n',
    input.model,
    '-o',
    input.outputDir,
    ...(input.extraArgs ?? []),
    input.inputPath,
  ];
}

export function resolveStemOutputPath(
  outputDir: string,
  model: string,
  inputPath: string,
): string {
  const base = basename(inputPath).replace(/\.[^.]+$/, '');
  return join(outputDir, model, base, 'no_vocals.mp3');
}

const PROGRESS_RE = /(\d{1,3})%/g;

export function parseDemucsProgress(stderrChunk: string): number | null {
  let last: number | null = null;
  for (const match of stderrChunk.matchAll(PROGRESS_RE)) {
    const value = Number(match[1]);
    if (Number.isFinite(value) && value >= 0 && value <= 100) {
      last = value;
    }
  }
  return last;
}

export interface SpawnDemucsOptions {
  executable: string;
  args: string[];
  timeoutMs: number;
  onStderr?: (chunk: string) => void;
  onChild?: (child: ChildProcess) => void;
  spawnFn?: typeof spawn;
}

export function spawnDemucs(
  options: SpawnDemucsOptions,
): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
  const spawnImpl = options.spawnFn ?? spawn;
  return new Promise((resolve, reject) => {
    let child: ChildProcess;
    try {
      child = spawnImpl(options.executable, options.args, {
        shell: false,
        stdio: ['ignore', 'ignore', 'pipe'],
      });
    } catch (err) {
      reject(err);
      return;
    }

    child.stderr?.on('data', (chunk: Buffer) => {
      options.onStderr?.(chunk.toString());
    });
    options.onChild?.(child);

    const timer = setTimeout(() => {
      child.kill('SIGTERM');
    }, options.timeoutMs);

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal });
    });
  });
}
