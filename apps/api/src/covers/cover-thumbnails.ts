import { spawnBinary } from '../external/spawn-binary';
import { readImageSize, type ImageSize } from './image-size';

export const COVER_SIZES = { sm: 128, lg: 640 } as const;

export type CoverSize = keyof typeof COVER_SIZES;

export const COVER_SIZE_KEYS = Object.keys(COVER_SIZES) as CoverSize[];

export type CoverFormat = 'webp' | 'jpg';

/** Beyond this the long edge would lose too much content to a centre crop. */
const MAX_CROP_ASPECT = 2;

const PAD_COLOR = '0x12121a';

export function isCoverSize(value: string): value is CoverSize {
  return value in COVER_SIZES;
}

export function buildScaleFilter(px: number, source: ImageSize | null): string {
  const aspect = source ? source.width / source.height : 1;
  const extreme =
    aspect > MAX_CROP_ASPECT || aspect < 1 / MAX_CROP_ASPECT;
  if (extreme) {
    return [
      `scale=${px}:${px}:force_original_aspect_ratio=decrease:flags=lanczos`,
      `pad=${px}:${px}:(ow-iw)/2:(oh-ih)/2:color=${PAD_COLOR}`,
    ].join(',');
  }
  return [
    `scale=${px}:${px}:force_original_aspect_ratio=increase:flags=lanczos`,
    `crop=${px}:${px}`,
  ].join(',');
}

export function buildFfmpegArgs(
  px: number,
  source: ImageSize | null,
  format: CoverFormat,
): string[] {
  const codec =
    format === 'webp'
      ? ['-c:v', 'libwebp', '-quality', '82']
      : ['-c:v', 'mjpeg', '-q:v', '3'];
  return [
    '-v',
    'error',
    '-i',
    'pipe:0',
    '-vf',
    buildScaleFilter(px, source),
    '-frames:v',
    '1',
    '-an',
    ...codec,
    '-f',
    'image2',
    '-update',
    '1',
    'pipe:1',
  ];
}

/** Ensures piped ffmpeg output is a complete image container, not a truncated RIFF. */
export function assertRenderedCover(data: Buffer, format: CoverFormat): void {
  if (format === 'webp') {
    if (
      data.length < 12 ||
      data.toString('ascii', 0, 4) !== 'RIFF' ||
      data.toString('ascii', 8, 12) !== 'WEBP' ||
      data.readUInt32LE(4) !== data.length - 8
    ) {
      throw new Error('Rendered webp has an invalid or incomplete RIFF container');
    }
    return;
  }
  if (
    data.length < 4 ||
    data[0] !== 0xff ||
    data[1] !== 0xd8 ||
    data[data.length - 2] !== 0xff ||
    data[data.length - 1] !== 0xd9
  ) {
    throw new Error('Rendered jpeg is missing SOI or EOI markers');
  }
}

export interface RenderedCover {
  size: CoverSize;
  data: Buffer;
}

export interface CoverRenderOptions {
  ffmpegPath: string;
  timeoutMs: number;
  format: CoverFormat;
}

export async function renderCoverSize(
  input: Buffer,
  size: CoverSize,
  options: CoverRenderOptions,
): Promise<Buffer> {
  const source = readImageSize(input);
  const args = buildFfmpegArgs(COVER_SIZES[size], source, options.format);
  const result = await spawnBinary(
    options.ffmpegPath,
    args,
    input,
    options.timeoutMs,
    'ffmpeg cover render',
  );
  if (result.code !== 0 || result.stdout.length === 0) {
    throw new Error(
      `ffmpeg failed to render ${size} cover: ${result.stderr.trim() || `exit ${result.code}`}`,
    );
  }
  assertRenderedCover(result.stdout, options.format);
  return result.stdout;
}

export async function renderCoverSizes(
  input: Buffer,
  options: CoverRenderOptions,
): Promise<RenderedCover[]> {
  const rendered: RenderedCover[] = [];
  for (const size of COVER_SIZE_KEYS) {
    rendered.push({ size, data: await renderCoverSize(input, size, options) });
  }
  return rendered;
}

/**
 * ffmpeg builds without libwebp still ship mjpeg, so probe once and remember.
 */
export async function detectCoverFormat(
  ffmpegPath: string,
  timeoutMs: number,
): Promise<CoverFormat> {
  try {
    const result = await spawnBinary(
      ffmpegPath,
      ['-hide_banner', '-loglevel', 'error', '-encoders'],
      null,
      timeoutMs,
      'ffmpeg encoder probe',
    );
    return result.stdout.toString('utf8').includes('libwebp') ? 'webp' : 'jpg';
  } catch {
    return 'jpg';
  }
}
