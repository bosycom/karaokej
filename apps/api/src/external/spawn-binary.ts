import { spawn } from 'node:child_process';

export interface SpawnBinaryResult {
  stdout: Buffer;
  stderr: string;
  code: number | null;
}

/**
 * Binary-safe sibling of spawnCollect: pipes a Buffer in and collects raw bytes
 * out, so image data survives without string coercion.
 */
export function spawnBinary(
  executable: string,
  args: string[],
  input: Buffer | null,
  timeoutMs: number,
  label = 'process',
): Promise<SpawnBinaryResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      shell: false,
      stdio: [input ? 'pipe' : 'ignore', 'pipe', 'pipe'],
    });
    const chunks: Buffer[] = [];
    let stderr = '';
    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      fn();
    };

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish(() => reject(new Error(`${label} timed out`)));
    }, timeoutMs);

    child.stdout?.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', (err) => {
      finish(() => reject(err));
    });
    child.on('close', (code) => {
      finish(() => resolve({ stdout: Buffer.concat(chunks), stderr, code }));
    });

    if (input) {
      // A closed reader is normal when ffmpeg stops early; do not fail the call.
      child.stdin?.on('error', () => undefined);
      child.stdin?.end(input);
    }
  });
}
