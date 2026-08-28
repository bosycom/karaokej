import { open } from 'node:fs/promises';
import { extname } from 'node:path';

const OGG_PAGE_MARKER = Buffer.from('OggS');
const OPUS_TAIL_BYTES = 64 * 1024;
const OPUS_SAMPLE_RATE = 48_000;
const MP3_SAMPLES_PER_FRAME = 1152;

export function parseOggGranuleFromTail(buffer: Buffer): bigint | null {
  for (let i = buffer.length - 27; i >= 0; i -= 1) {
    if (
      buffer[i] !== OGG_PAGE_MARKER[0] ||
      buffer[i + 1] !== OGG_PAGE_MARKER[1] ||
      buffer[i + 2] !== OGG_PAGE_MARKER[2] ||
      buffer[i + 3] !== OGG_PAGE_MARKER[3]
    ) {
      continue;
    }
    const view = new DataView(
      buffer.buffer,
      buffer.byteOffset + i + 6,
      8,
    );
    const lo = BigInt(view.getUint32(0, true));
    const hi = BigInt(view.getUint32(4, true));
    const granule = (hi << 32n) | lo;
    if (granule <= 0n) {
      continue;
    }
    return granule;
  }
  return null;
}

export function granuleToDurationMs(granule: bigint): number {
  return Math.round(Number(granule) / (OPUS_SAMPLE_RATE / 1000));
}

export function isOggContainerPath(absolutePath: string): boolean {
  const ext = extname(absolutePath).toLowerCase();
  return ext === '.opus' || ext === '.ogg';
}

export function isFlacPath(absolutePath: string): boolean {
  return extname(absolutePath).toLowerCase() === '.flac';
}

export function isMp3Path(absolutePath: string): boolean {
  return extname(absolutePath).toLowerCase() === '.mp3';
}

function flacStreamInfoDuration(buffer: Buffer, offset: number): number | null {
  const packed = buffer.readBigUInt64BE(offset + 10);
  const sampleRate = Number(packed >> 44n);
  const totalSamples = Number(packed & ((1n << 36n) - 1n));
  if (sampleRate <= 0 || totalSamples <= 0) {
    return null;
  }
  return Math.round((totalSamples / sampleRate) * 1000);
}

export function flacDurationFromHeader(buffer: Buffer): number | null {
  if (buffer.length < 42 || buffer.toString('ascii', 0, 4) !== 'fLaC') {
    return null;
  }

  let pos = 4;
  while (pos + 4 <= buffer.length) {
    const blockHeader = buffer[pos]!;
    const blockType = blockHeader & 0x7f;
    const isLast = (blockHeader & 0x80) !== 0;
    const blockLen =
      (buffer[pos + 1]! << 16) |
      (buffer[pos + 2]! << 8) |
      buffer[pos + 3]!;
    pos += 4;
    if (blockType === 0 && blockLen >= 18 && buffer.length >= pos + 18) {
      return flacStreamInfoDuration(buffer, pos);
    }
    pos += blockLen;
    if (isLast) {
      break;
    }
  }
  return null;
}

function mp3SampleRateFromSync(buffer: Buffer, syncOffset: number): number | null {
  if (syncOffset + 4 > buffer.length) {
    return null;
  }
  const b1 = buffer[syncOffset + 2]!;
  const version = (b1 >> 3) & 0x03;
  const srIndex = (b1 >> 2) & 0x03;
  if (srIndex === 3) {
    return null;
  }
  const mpeg1 = version === 3;
  const rates = mpeg1
    ? [44100, 48000, 32000]
    : [22050, 24000, 16000];
  return rates[srIndex] ?? null;
}

function findMp3Sync(buffer: Buffer, start: number): number {
  for (let i = start; i + 1 < buffer.length; i += 1) {
    if (buffer[i] === 0xff && (buffer[i + 1]! & 0xe0) === 0xe0) {
      return i;
    }
  }
  return -1;
}

function durationFromXingTag(
  buffer: Buffer,
  tagOffset: number,
  fileSize: number,
): number | null {
  if (tagOffset + 16 > buffer.length) {
    return null;
  }
  const flags = buffer.readUInt32BE(tagOffset + 4);
  const syncOffset = findMp3Sync(buffer, Math.max(0, tagOffset - 512));
  const sampleRate =
    syncOffset >= 0 ? mp3SampleRateFromSync(buffer, syncOffset) : null;
  const rate = sampleRate ?? 44100;

  if (flags & 0x01 && tagOffset + 12 <= buffer.length) {
    const frames = buffer.readUInt32BE(tagOffset + 8);
    if (frames > 0) {
      return Math.round((frames * MP3_SAMPLES_PER_FRAME * 1000) / rate);
    }
  }

  if (flags & 0x02 && tagOffset + 16 <= buffer.length) {
    const bytes = buffer.readUInt32BE(tagOffset + 12);
    if (bytes > 0 && fileSize > bytes) {
      const audioStart = fileSize - bytes;
      if (audioStart >= 0 && fileSize > audioStart) {
        const audioBytes = fileSize - audioStart;
        const durationSec = (audioBytes * 8) / (rate * 1000 / MP3_SAMPLES_PER_FRAME);
        if (durationSec > 0) {
          return Math.round(durationSec * 1000);
        }
      }
    }
  }

  return null;
}

function durationFromVbriTag(buffer: Buffer, tagOffset: number): number | null {
  if (tagOffset + 26 > buffer.length) {
    return null;
  }
  const frames = buffer.readUInt32BE(tagOffset + 14);
  if (frames <= 0) {
    return null;
  }
  const syncOffset = findMp3Sync(buffer, Math.max(0, tagOffset - 512));
  const sampleRate =
    syncOffset >= 0 ? mp3SampleRateFromSync(buffer, syncOffset) : null;
  const rate = sampleRate ?? 44100;
  return Math.round((frames * MP3_SAMPLES_PER_FRAME * 1000) / rate);
}

export function mp3DurationFromHeader(
  buffer: Buffer,
  fileSize: number,
): number | null {
  let searchFrom = 0;
  while (searchFrom < buffer.length) {
    const vbriIdx = buffer.indexOf('VBRI', searchFrom, 'latin1');
    if (vbriIdx >= 0) {
      const duration = durationFromVbriTag(buffer, vbriIdx);
      if (duration != null) {
        return duration;
      }
      searchFrom = vbriIdx + 4;
      continue;
    }
    break;
  }

  for (const tag of ['Xing', 'Info'] as const) {
    let searchFrom = 0;
    while (searchFrom < buffer.length) {
      const idx = buffer.indexOf(tag, searchFrom, 'latin1');
      if (idx < 0) {
        break;
      }
      const duration = durationFromXingTag(buffer, idx, fileSize);
      if (duration != null) {
        return duration;
      }
      searchFrom = idx + 4;
    }
  }

  return null;
}

export async function opusDurationFromTail(
  absolutePath: string,
): Promise<number | null> {
  const fh = await open(absolutePath, 'r');
  try {
    const { size } = await fh.stat();
    if (size <= 0) {
      return null;
    }
    const readLength = Math.min(OPUS_TAIL_BYTES, size);
    const buffer = Buffer.alloc(readLength);
    await fh.read(buffer, 0, readLength, size - readLength);
    const granule = parseOggGranuleFromTail(buffer);
    return granule == null ? null : granuleToDurationMs(granule);
  } finally {
    await fh.close();
  }
}

export async function readAudioHeaderBuffer(
  absolutePath: string,
  maxBytes: number,
): Promise<{ buffer: Buffer; fileSize: number }> {
  const fh = await open(absolutePath, 'r');
  try {
    const { size } = await fh.stat();
    if (size <= 0) {
      return { buffer: Buffer.alloc(0), fileSize: 0 };
    }
    const readLength = Math.min(maxBytes, size);
    const buffer = Buffer.alloc(readLength);
    await fh.read(buffer, 0, readLength, 0);
    return { buffer, fileSize: size };
  } finally {
    await fh.close();
  }
}

export const HEADER_READ_BYTES: Record<string, number> = {
  '.mp3': 256 * 1024,
  '.flac': 64 * 1024,
  '.opus': 64 * 1024,
};

export const MIME_BY_EXT: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.flac': 'audio/flac',
  '.opus': 'audio/ogg',
};
