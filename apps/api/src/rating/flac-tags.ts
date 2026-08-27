import { createReadStream, createWriteStream } from 'node:fs';
import { open } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { atomicReplace } from './atomic-replace';
import {
  parseVorbisCommentPacket,
  serializeVorbisCommentPacket,
  setRatingComment,
} from './vorbis-comment';

const FLAC_MAGIC = Buffer.from('fLaC');
const BLOCK_VORBIS_COMMENT = 4;
const BLOCK_PADDING = 1;

interface FlacBlock {
  type: number;
  data: Buffer;
}

function encodeBlock(type: number, data: Uint8Array, last: boolean): Buffer {
  const header = Buffer.alloc(4);
  header[0] = type | (last ? 0x80 : 0);
  header.writeUIntBE(data.length, 1, 3);
  return Buffer.concat([header, Buffer.from(data)]);
}

async function readBlocks(absolutePath: string): Promise<{
  blocks: FlacBlock[];
  audioOffset: number;
}> {
  const fh = await open(absolutePath, 'r');
  try {
    const magic = Buffer.alloc(4);
    const { bytesRead } = await fh.read(magic, 0, 4, 0);
    if (bytesRead < 4 || !magic.equals(FLAC_MAGIC)) {
      throw new Error('Not a FLAC file');
    }
    const blocks: FlacBlock[] = [];
    let offset = 4;
    let last = false;
    while (!last) {
      const header = Buffer.alloc(4);
      const readHeader = await fh.read(header, 0, 4, offset);
      if (readHeader.bytesRead < 4) {
        throw new Error('FLAC metadata header is truncated');
      }
      last = (header[0] & 0x80) !== 0;
      const type = header[0] & 0x7f;
      const length = header.readUIntBE(1, 3);
      offset += 4;
      const data = Buffer.alloc(length);
      if (length > 0) {
        const readData = await fh.read(data, 0, length, offset);
        if (readData.bytesRead < length) {
          throw new Error('FLAC metadata block is truncated');
        }
      }
      offset += length;
      blocks.push({ type, data });
    }
    return { blocks, audioOffset: offset };
  } finally {
    await fh.close();
  }
}

function applyRating(blocks: FlacBlock[], rating: number): FlacBlock[] {
  const next = blocks.map((block) => ({ ...block }));
  const index = next.findIndex((block) => block.type === BLOCK_VORBIS_COMMENT);
  if (index >= 0) {
    const parsed = parseVorbisCommentPacket(next[index].data);
    next[index] = {
      type: BLOCK_VORBIS_COMMENT,
      data: serializeVorbisCommentPacket(
        parsed.vendor,
        setRatingComment(parsed.comments, rating),
      ),
    };
    return next;
  }
  const comment = {
    type: BLOCK_VORBIS_COMMENT,
    data: serializeVorbisCommentPacket(
      'karaokej',
      setRatingComment([], rating),
    ),
  };
  const insertAt = next.length > 0 ? 1 : 0;
  next.splice(insertAt, 0, comment);
  return next;
}

function encodeMetadata(blocks: FlacBlock[]): Buffer {
  const parts: Uint8Array[] = [FLAC_MAGIC];
  blocks.forEach((block, index) => {
    parts.push(encodeBlock(block.type, block.data, index === blocks.length - 1));
  });
  return Buffer.concat(parts);
}

function fitWithPadding(blocks: FlacBlock[], targetMetaBytes: number): Buffer | null {
  const withoutPadding = blocks.filter((block) => block.type !== BLOCK_PADDING);
  const encoded = encodeMetadata(withoutPadding);
  if (encoded.length === targetMetaBytes) {
    return encoded;
  }
  if (encoded.length > targetMetaBytes) {
    return null;
  }
  const padBytes = targetMetaBytes - encoded.length - 4;
  if (padBytes < 0) {
    return null;
  }
  const padded = [
    ...withoutPadding,
    { type: BLOCK_PADDING, data: Buffer.alloc(padBytes) },
  ];
  return encodeMetadata(padded);
}

export async function writeFlacRating(
  absolutePath: string,
  rating: number,
): Promise<void> {
  const { blocks, audioOffset } = await readBlocks(absolutePath);
  const updated = applyRating(blocks, rating);
  const inPlace = fitWithPadding(updated, audioOffset);
  if (inPlace) {
    const fh = await open(absolutePath, 'r+');
    try {
      await fh.write(inPlace, 0, inPlace.length, 0);
    } finally {
      await fh.close();
    }
    return;
  }

  await atomicReplace(absolutePath, async (tempPath) => {
    const header = encodeMetadata(updated);
    const out = createWriteStream(tempPath);
    await new Promise<void>((resolve, reject) => {
      out.write(header, (err) => (err ? reject(err) : resolve()));
    });
    await pipeline(createReadStream(absolutePath, { start: audioOffset }), out);
  });
}
