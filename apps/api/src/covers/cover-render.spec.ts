import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { spawnBinary } from '../external/spawn-binary';
import { detectCoverFormat, renderCoverSize } from './cover-thumbnails';
import { readImageSize } from './image-size';

const FFMPEG = '/usr/bin/ffmpeg';
const TIMEOUT_MS = 30_000;

/** Skipped where ffmpeg is not installed, e.g. a bare CI image. */
const describeWithFfmpeg = existsSync(FFMPEG) ? describe : describe.skip;

async function makeSourceImage(width: number, height: number): Promise<Buffer> {
  const result = await spawnBinary(
    FFMPEG,
    [
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      `testsrc=s=${width}x${height}`,
      '-frames:v',
      '1',
      '-f',
      'mjpeg',
      'pipe:1',
    ],
    null,
    TIMEOUT_MS,
    'test fixture',
  );
  expect(result.code).toBe(0);
  return result.stdout;
}

/** High-entropy source so the lg webp exceeds ffmpeg's 32 KB pipe buffer. */
async function makeNoisySourceImage(): Promise<Buffer> {
  const result = await spawnBinary(
    FFMPEG,
    [
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'color=c=black:s=800x800,geq=random(1)*255:random(2)*255:random(3)*255',
      '-frames:v',
      '1',
      '-f',
      'mjpeg',
      'pipe:1',
    ],
    null,
    TIMEOUT_MS,
    'noisy test fixture',
  );
  expect(result.code).toBe(0);
  return result.stdout;
}

describeWithFfmpeg('cover rendering through ffmpeg', () => {
  it('renders both managed sizes as exact squares', async () => {
    const source = await makeSourceImage(1400, 900);
    const format = await detectCoverFormat(FFMPEG, TIMEOUT_MS);
    const options = { ffmpegPath: FFMPEG, timeoutMs: TIMEOUT_MS, format };

    const small = await renderCoverSize(source, 'sm', options);
    const large = await renderCoverSize(source, 'lg', options);

    expect(readImageSize(small)).toEqual({ width: 128, height: 128 });
    expect(readImageSize(large)).toEqual({ width: 640, height: 640 });
  }, 60_000);

  it('produces thumbnails far smaller than the source artwork', async () => {
    const source = await makeSourceImage(1400, 1400);
    const format = await detectCoverFormat(FFMPEG, TIMEOUT_MS);
    const small = await renderCoverSize(source, 'sm', {
      ffmpegPath: FFMPEG,
      timeoutMs: TIMEOUT_MS,
      format,
    });
    expect(small.length).toBeLessThan(source.length / 4);
  }, 60_000);

  it('squares off an extreme aspect ratio by padding', async () => {
    const source = await makeSourceImage(1600, 400);
    const format = await detectCoverFormat(FFMPEG, TIMEOUT_MS);
    const small = await renderCoverSize(source, 'sm', {
      ffmpegPath: FFMPEG,
      timeoutMs: TIMEOUT_MS,
      format,
    });
    expect(readImageSize(small)).toEqual({ width: 128, height: 128 });
  }, 60_000);

  it('reports a useful error for data that is not an image', async () => {
    const format = await detectCoverFormat(FFMPEG, TIMEOUT_MS);
    await expect(
      renderCoverSize(Buffer.from('not an image'), 'sm', {
        ffmpegPath: FFMPEG,
        timeoutMs: TIMEOUT_MS,
        format,
      }),
    ).rejects.toThrow(/ffmpeg failed/);
  }, 60_000);

  it('writes a self-consistent RIFF container for large webp output', async () => {
    const format = await detectCoverFormat(FFMPEG, TIMEOUT_MS);
    if (format !== 'webp') {
      return;
    }
    const source = await makeNoisySourceImage();
    const large = await renderCoverSize(source, 'lg', {
      ffmpegPath: FFMPEG,
      timeoutMs: TIMEOUT_MS,
      format: 'webp',
    });
    expect(large.length).toBeGreaterThan(32768);
    expect(large.toString('ascii', 0, 4)).toBe('RIFF');
    expect(large.toString('ascii', 8, 12)).toBe('WEBP');
    expect(large.readUInt32LE(4)).toBe(large.length - 8);
  }, 60_000);
});
