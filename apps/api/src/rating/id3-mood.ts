import { readId3Region } from './id3-region';

const HEADER_BYTES = 10;
const FRAME_HEADER_BYTES = 10;

interface Id3Frame {
  id: string;
  flags: [number, number];
  body: Buffer;
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

function frameBodySize(header: Buffer, version: number): number {
  if (version === 4) {
    return readSynchsafe(header, 4);
  }
  return header.readUInt32BE(4);
}

function splitFrames(body: Buffer, version: number): { frames: Id3Frame[]; padding: Buffer } {
  const frames: Id3Frame[] = [];
  let offset = 0;
  while (offset + FRAME_HEADER_BYTES <= body.length && body[offset] !== 0) {
    const header = body.subarray(offset, offset + FRAME_HEADER_BYTES);
    const id = header.toString('latin1', 0, 4);
    if (!/^[A-Z0-9]{4}$/.test(id)) {
      break;
    }
    const size = frameBodySize(header, version);
    const next = offset + FRAME_HEADER_BYTES + size;
    if (size < 0 || next > body.length) {
      break;
    }
    frames.push({
      id,
      flags: [header[8], header[9]],
      body: Buffer.from(body.subarray(offset + FRAME_HEADER_BYTES, next)),
    });
    offset = next;
  }
  return { frames, padding: Buffer.from(body.subarray(offset)) };
}

function mapV3Flags(flags: [number, number]): [number, number] {
  const [b0, b1] = flags;
  const out0 =
    ((b0 & 0x80) !== 0 ? 0x40 : 0) |
    ((b0 & 0x40) !== 0 ? 0x20 : 0) |
    ((b0 & 0x20) !== 0 ? 0x10 : 0);
  const out1 =
    ((b1 & 0x20) !== 0 ? 0x40 : 0) |
    ((b1 & 0x80) !== 0 ? 0x08 : 0) |
    ((b1 & 0x40) !== 0 ? 0x04 : 0);
  return [out0, out1];
}

function encodeFrame(frame: Id3Frame, version: number): Buffer {
  const header = Buffer.alloc(FRAME_HEADER_BYTES);
  header.write(frame.id, 0, 'latin1');
  if (version === 4) {
    writeSynchsafe(header, 4, frame.body.length);
  } else {
    header.writeUInt32BE(frame.body.length, 4);
  }
  header[8] = frame.flags[0];
  header[9] = frame.flags[1];
  return Buffer.concat([header, frame.body]);
}

function decodeId3String(encoding: number, data: Buffer): string {
  if (encoding === 0) {
    return data.toString('latin1');
  }
  if (encoding === 3) {
    return data.toString('utf8');
  }
  if (encoding === 2) {
    const swapped = Buffer.alloc(data.length - (data.length % 2));
    for (let i = 0; i + 1 < data.length; i += 2) {
      swapped[i] = data[i + 1];
      swapped[i + 1] = data[i];
    }
    return swapped.toString('utf16le');
  }
  let text = data;
  if (text.length >= 2 && text[0] === 0xff && text[1] === 0xfe) {
    text = text.subarray(2);
  } else if (text.length >= 2 && text[0] === 0xfe && text[1] === 0xff) {
    const swapped = Buffer.alloc(text.length - 2 - ((text.length - 2) % 2));
    for (let i = 2; i + 1 < text.length; i += 2) {
      swapped[i - 2] = text[i + 1];
      swapped[i - 1] = text[i];
    }
    return swapped.toString('utf16le');
  }
  return text.toString('utf16le');
}

function decodeMoodBody(body: Buffer): string[] {
  if (body.length < 1) {
    return [];
  }
  const text = decodeId3String(body[0], body.subarray(1));
  return text
    .split('\0')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function moodFrame(values: string[]): Id3Frame {
  const parts = values.map((value) => Buffer.from(`${value}\0`, 'utf8'));
  return {
    id: 'TMOO',
    flags: [0, 0],
    body: Buffer.concat([Buffer.from([0x03]), ...parts]),
  };
}

export function readMoodValues(file: Buffer): string[] {
  const region = readId3Region(file);
  if (!region || file[3] !== 3 && file[3] !== 4) {
    return [];
  }
  const version = file[3] === 4 ? 4 : 3;
  const hasFooter = (file[5] & 0x10) !== 0;
  const bodyEnd = region.totalBytes - (hasFooter ? 10 : 0);
  const { frames } = splitFrames(file.subarray(HEADER_BYTES, bodyEnd), version);
  const frame = frames.find((entry) => entry.id === 'TMOO');
  return frame ? decodeMoodBody(frame.body) : [];
}

/**
 * Rewrites the TMOO frame. A non-empty mood list marks the tag ID3v2.4 and
 * stores the names as NUL-separated UTF-8 strings. Padding is reused so the
 * audio offset stays put when the new frame fits.
 */
export function writeMoodValues(file: Buffer, values: string[]): Buffer {
  const region = readId3Region(file);
  if (!region) {
    return file;
  }
  const versionByte = file[3];
  if (versionByte !== 3 && versionByte !== 4) {
    return file;
  }
  const flags = file[5];
  if ((flags & 0x80) !== 0 || (flags & 0x10) !== 0) {
    throw new Error('Cannot write mood into an unsynchronised or footer ID3 tag');
  }
  const version = versionByte === 4 ? 4 : 3;
  const bodyEnd = region.totalBytes;
  const body = file.subarray(HEADER_BYTES, bodyEnd);
  const { frames } = splitFrames(body, version);
  const kept = frames.filter((frame) => frame.id !== 'TMOO');
  const outVersion = values.length > 0 ? 4 : version;
  const nextFrames = values.length > 0 ? [...kept, moodFrame(values)] : kept;
  const encoded = nextFrames.map((frame) => {
    const flagsOut: [number, number] =
      version === 3 && outVersion === 4 ? mapV3Flags(frame.flags) : frame.flags;
    return encodeFrame(
      frame.id === 'TMOO' ? frame : { ...frame, flags: flagsOut },
      outVersion,
    );
  });
  const framesBuf = Buffer.concat(encoded);
  const oldBodyLen = body.length;
  const newBody =
    framesBuf.length <= oldBodyLen
      ? Buffer.concat([framesBuf, Buffer.alloc(oldBodyLen - framesBuf.length)])
      : framesBuf;
  const header = Buffer.alloc(HEADER_BYTES);
  header.write('ID3', 0, 'latin1');
  header[3] = outVersion;
  header[4] = 0;
  header[5] = flags;
  writeSynchsafe(header, 6, newBody.length);
  return Buffer.concat([header, newBody, file.subarray(region.totalBytes)]);
}
