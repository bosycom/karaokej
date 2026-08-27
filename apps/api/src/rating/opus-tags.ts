import { readFile, writeFile } from 'node:fs/promises';
import { atomicReplace } from './atomic-replace';
import {
  parseVorbisCommentPacket,
  serializeVorbisCommentPacket,
  setRatingComment,
} from './vorbis-comment';

const OGGS = Buffer.from('OggS');
const OPUS_HEAD = Buffer.from('OpusHead');
const OPUS_TAGS = Buffer.from('OpusTags');

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let r = i << 24;
    for (let j = 0; j < 8; j += 1) {
      r = r & 0x80000000 ? (r << 1) ^ 0x04c11db7 : r << 1;
    }
    table[i] = r >>> 0;
  }
  return table;
})();

function oggCrc(buf: Buffer): number {
  let crc = 0;
  for (let i = 0; i < buf.length; i += 1) {
    crc = ((crc << 8) ^ CRC_TABLE[((crc >>> 24) ^ buf[i]) & 0xff]) >>> 0;
  }
  return crc;
}

interface OggPage {
  headerType: number;
  granule: bigint;
  serial: number;
  sequence: number;
  segments: Buffer[];
}

function readPage(data: Buffer, offset: number): { page: OggPage; next: number } {
  if (offset + 27 > data.length || !data.subarray(offset, offset + 4).equals(OGGS)) {
    throw new Error('Invalid Ogg page');
  }
  const segmentCount = data[offset + 26];
  const tableStart = offset + 27;
  const tableEnd = tableStart + segmentCount;
  if (tableEnd > data.length) {
    throw new Error('Ogg segment table is truncated');
  }
  const sizes: number[] = [];
  let bodySize = 0;
  for (let i = 0; i < segmentCount; i += 1) {
    const size = data[tableStart + i];
    sizes.push(size);
    bodySize += size;
  }
  const bodyStart = tableEnd;
  const bodyEnd = bodyStart + bodySize;
  if (bodyEnd > data.length) {
    throw new Error('Ogg page body is truncated');
  }
  const segments: Buffer[] = [];
  let cursor = bodyStart;
  for (const size of sizes) {
    segments.push(data.subarray(cursor, cursor + size));
    cursor += size;
  }
  return {
    page: {
      headerType: data[offset + 5],
      granule: data.readBigUInt64LE(offset + 6),
      serial: data.readUInt32LE(offset + 14),
      sequence: data.readUInt32LE(offset + 18),
      segments,
    },
    next: bodyEnd,
  };
}

function writePage(page: OggPage): Buffer {
  const body = Buffer.concat(page.segments);
  const header = Buffer.alloc(27 + page.segments.length);
  OGGS.copy(header, 0);
  header[4] = 0;
  header[5] = page.headerType;
  header.writeBigUInt64LE(page.granule, 6);
  header.writeUInt32LE(page.serial, 14);
  header.writeUInt32LE(page.sequence, 18);
  header.writeUInt32LE(0, 22);
  header[26] = page.segments.length;
  for (let i = 0; i < page.segments.length; i += 1) {
    header[27 + i] = page.segments[i].length;
  }
  const full = Buffer.concat([header, body]);
  full.writeUInt32LE(oggCrc(full), 22);
  return full;
}

function packetFromPages(pages: OggPage[]): Buffer {
  const chunks: Buffer[] = [];
  for (const page of pages) {
    chunks.push(...page.segments);
  }
  return Buffer.concat(chunks);
}

function splitSegments(packet: Buffer): Buffer[] {
  const segments: Buffer[] = [];
  let offset = 0;
  while (offset < packet.length) {
    const size = Math.min(255, packet.length - offset);
    segments.push(packet.subarray(offset, offset + size));
    offset += size;
  }
  if (segments.length === 0 || segments[segments.length - 1].length === 255) {
    segments.push(Buffer.alloc(0));
  }
  return segments;
}

function pagesForPacket(
  packet: Buffer,
  serial: number,
  startSequence: number,
  firstHeaderType: number,
  lastHeaderType: number,
): OggPage[] {
  const segments = splitSegments(packet);
  const pages: OggPage[] = [];
  let index = 0;
  let sequence = startSequence;
  while (index < segments.length) {
    const chunk = segments.slice(index, index + 255);
    index += chunk.length;
    const first = pages.length === 0;
    const last = index >= segments.length;
    let headerType = 0;
    if (first) {
      headerType |= firstHeaderType;
    } else {
      headerType |= 0x01;
    }
    if (last) {
      headerType |= lastHeaderType;
    }
    pages.push({
      headerType,
      granule: 0n,
      serial,
      sequence,
      segments: chunk,
    });
    sequence += 1;
  }
  return pages;
}

function parseOgg(data: Buffer): OggPage[] {
  const pages: OggPage[] = [];
  let offset = 0;
  while (offset < data.length) {
    const { page, next } = readPage(data, offset);
    pages.push(page);
    offset = next;
  }
  return pages;
}

export async function writeOpusRating(
  absolutePath: string,
  rating: number,
): Promise<void> {
  const data = await readFile(absolutePath);
  const pages = parseOgg(data);
  if (pages.length === 0) {
    throw new Error('Empty Ogg file');
  }
  const headPages: OggPage[] = [];
  const tagPages: OggPage[] = [];
  const rest: OggPage[] = [];
  let stage: 'head' | 'tags' | 'audio' = 'head';
  for (const page of pages) {
    if (stage === 'head') {
      headPages.push(page);
      const packet = packetFromPages(headPages);
      if (packet.length >= 8 && packet.subarray(0, 8).equals(OPUS_HEAD)) {
        const continued = page.segments.length > 0 && page.segments[page.segments.length - 1].length === 255;
        if (!continued) {
          stage = 'tags';
        }
      }
      continue;
    }
    if (stage === 'tags') {
      tagPages.push(page);
      const packet = packetFromPages(tagPages);
      if (packet.length >= 8 && packet.subarray(0, 8).equals(OPUS_TAGS)) {
        const continued = page.segments.length > 0 && page.segments[page.segments.length - 1].length === 255;
        if (!continued) {
          stage = 'audio';
        }
      }
      continue;
    }
    rest.push(page);
  }

  if (headPages.length === 0 || tagPages.length === 0) {
    throw new Error('Opus identification or comment header is missing');
  }

  const tagPacket = packetFromPages(tagPages);
  if (!tagPacket.subarray(0, 8).equals(OPUS_TAGS)) {
    throw new Error('Opus comment header is invalid');
  }
  const parsed = parseVorbisCommentPacket(tagPacket.subarray(8));
  const nextPacket = Buffer.concat([
    OPUS_TAGS,
    serializeVorbisCommentPacket(
      parsed.vendor,
      setRatingComment(parsed.comments, rating),
    ),
  ]);

  const serial = headPages[0].serial;
  const newTagPages = pagesForPacket(nextPacket, serial, headPages.length, 0, 0);
  const sequenceBase = headPages.length + newTagPages.length;
  const rewrittenRest = rest.map((page, index) => ({
    ...page,
    sequence: sequenceBase + index,
  }));

  const out = Buffer.concat([
    ...headPages.map(writePage),
    ...newTagPages.map(writePage),
    ...rewrittenRest.map(writePage),
  ]);

  await atomicReplace(absolutePath, async (tempPath) => {
    await writeFile(tempPath, out);
  });
}
