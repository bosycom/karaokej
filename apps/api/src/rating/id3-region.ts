const ID3_HEADER_BYTES = 10;
const ID3_FOOTER_BYTES = 10;
const FLAG_UNSYNCHRONISATION = 0x80;
const FLAG_FOOTER = 0x10;

/**
 * Padding reserved when a file has to be rewritten anyway, so that later tag edits
 * fit inside the existing tag area and never move the audio frames again.
 */
export const RESERVED_TAG_PADDING_BYTES = 4096;

export interface Id3Region {
  /** Bytes the tag occupies at the head of the file, header and footer included. */
  totalBytes: number;
  /** True when trailing zero padding may be added inside the tag. */
  paddable: boolean;
}

function readSynchsafe(buffer: Buffer, offset: number): number {
  return (
    ((buffer[offset] & 0x7f) << 21) |
    ((buffer[offset + 1] & 0x7f) << 14) |
    ((buffer[offset + 2] & 0x7f) << 7) |
    (buffer[offset + 3] & 0x7f)
  );
}

function writeSynchsafe(buffer: Buffer, offset: number, value: number): void {
  buffer[offset] = (value >>> 21) & 0x7f;
  buffer[offset + 1] = (value >>> 14) & 0x7f;
  buffer[offset + 2] = (value >>> 7) & 0x7f;
  buffer[offset + 3] = value & 0x7f;
}

export function readId3Region(buffer: Buffer): Id3Region | null {
  if (buffer.length < ID3_HEADER_BYTES) {
    return null;
  }
  if (buffer.toString('latin1', 0, 3) !== 'ID3') {
    return null;
  }
  const flags = buffer[5];
  const size = readSynchsafe(buffer, 6);
  if (size <= 0) {
    return null;
  }
  const hasFooter = (flags & FLAG_FOOTER) !== 0;
  const totalBytes = ID3_HEADER_BYTES + size + (hasFooter ? ID3_FOOTER_BYTES : 0);
  if (totalBytes > buffer.length) {
    return null;
  }
  return {
    totalBytes,
    // A tag with a footer must not be padded, and padding inside an unsynchronised
    // tag would have to be unsynchronised too.
    paddable: !hasFooter && (flags & FLAG_UNSYNCHRONISATION) === 0,
  };
}

/**
 * Re-emits `tag` as exactly `totalBytes` bytes by growing its trailing zero padding.
 * Returns null when the frames do not fit or the tag cannot carry padding.
 */
export function padId3Tag(tag: Buffer, totalBytes: number): Buffer | null {
  const region = readId3Region(tag);
  if (!region || !region.paddable) {
    return null;
  }
  if (totalBytes < region.totalBytes) {
    return null;
  }
  const out = Buffer.alloc(totalBytes);
  tag.copy(out, 0, 0, region.totalBytes);
  writeSynchsafe(out, 6, totalBytes - ID3_HEADER_BYTES);
  return out;
}

/**
 * Grows the tag area of an already tagged MP3 buffer, so the next edit fits inside
 * it and can be applied without moving the audio frames.
 */
export function withReservedTagPadding(file: Buffer): Buffer {
  const region = readId3Region(file);
  if (!region) {
    return file;
  }
  const padded = padId3Tag(
    file.subarray(0, region.totalBytes),
    region.totalBytes + RESERVED_TAG_PADDING_BYTES,
  );
  if (!padded) {
    return file;
  }
  return Buffer.concat([padded, file.subarray(region.totalBytes)]);
}

/** True when `buffer` starts with an MPEG audio frame sync at `offset`. */
export function hasMpegFrameSync(buffer: Buffer, offset: number): boolean {
  return (
    offset + 1 < buffer.length &&
    buffer[offset] === 0xff &&
    (buffer[offset + 1] & 0xe0) === 0xe0
  );
}
