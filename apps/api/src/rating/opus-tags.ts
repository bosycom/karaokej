import { open, readFile } from 'node:fs/promises';
import { safePatchRegion, safeReplaceWithBuffer } from './safe-file-write';
import {
  applyMetadataComments,
  parseVorbisCommentPacket,
  serializeVorbisCommentPacket,
  setRatingComment,
  type VorbisComment,
  type VorbisMetadataInput,
} from './vorbis-comment';

const OGGS = Buffer.from('OggS');
const OPUS_HEAD = Buffer.from('OpusHead');
const OPUS_TAGS = Buffer.from('OpusTags');

/**
 * Padding reserved when the file has to be rebuilt anyway. RFC 7845 allows trailing
 * data after the comment list, so later edits can grow into it while the packet, and
 * with it every Ogg page and every audio byte offset, keeps its size.
 */
const RESERVED_PADDING_BYTES = 4096;

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

interface PageEntry {
  page: OggPage;
  start: number;
  end: number;
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

function parseOgg(data: Buffer): PageEntry[] {
  const entries: PageEntry[] = [];
  let offset = 0;
  while (offset < data.length) {
    const { page, next } = readPage(data, offset);
    entries.push({ page, start: offset, end: next });
    offset = next;
  }
  return entries;
}

interface OpusLayout {
  head: PageEntry[];
  tags: PageEntry[];
  rest: PageEntry[];
  /** The complete comment packet, `OpusTags` magic included. */
  tagPacket: Buffer;
  tagStart: number;
  tagEnd: number;
}

function isContinued(page: OggPage): boolean {
  return (
    page.segments.length > 0 &&
    page.segments[page.segments.length - 1].length === 255
  );
}

function readOpusLayout(data: Buffer): OpusLayout {
  const entries = parseOgg(data);
  if (entries.length === 0) {
    throw new Error('Empty Ogg file');
  }
  const head: PageEntry[] = [];
  const tags: PageEntry[] = [];
  const rest: PageEntry[] = [];
  let stage: 'head' | 'tags' | 'audio' = 'head';
  for (const entry of entries) {
    if (stage === 'head') {
      head.push(entry);
      const packet = packetFromPages(head.map((item) => item.page));
      if (
        packet.length >= 8 &&
        packet.subarray(0, 8).equals(OPUS_HEAD) &&
        !isContinued(entry.page)
      ) {
        stage = 'tags';
      }
      continue;
    }
    if (stage === 'tags') {
      tags.push(entry);
      const packet = packetFromPages(tags.map((item) => item.page));
      if (
        packet.length >= 8 &&
        packet.subarray(0, 8).equals(OPUS_TAGS) &&
        !isContinued(entry.page)
      ) {
        stage = 'audio';
      }
      continue;
    }
    rest.push(entry);
  }

  if (head.length === 0 || tags.length === 0) {
    throw new Error('Opus identification or comment header is missing');
  }
  const tagPacket = packetFromPages(tags.map((item) => item.page));
  if (!tagPacket.subarray(0, 8).equals(OPUS_TAGS)) {
    throw new Error('Opus comment header is invalid');
  }
  return {
    head,
    tags,
    rest,
    tagPacket,
    tagStart: tags[0].start,
    tagEnd: tags[tags.length - 1].end,
  };
}

/**
 * Re-emits the given pages carrying `packet`, keeping every page and segment size
 * exactly as it was. Only the body bytes and the page checksums change, so the file
 * length and all audio offsets stay put.
 */
function rebuildPagesInPlace(entries: PageEntry[], packet: Buffer): Buffer {
  const capacity = entries.reduce(
    (sum, entry) =>
      sum +
      entry.page.segments.reduce((inner, segment) => inner + segment.length, 0),
    0,
  );
  if (capacity !== packet.length) {
    throw new Error(
      `Comment packet is ${packet.length} bytes but the existing pages hold ${capacity}`,
    );
  }
  const parts: Buffer[] = [];
  let cursor = 0;
  for (const entry of entries) {
    const segments = entry.page.segments.map((segment) => {
      const next = packet.subarray(cursor, cursor + segment.length);
      cursor += segment.length;
      return next;
    });
    parts.push(writePage({ ...entry.page, segments }));
  }
  return Buffer.concat(parts);
}

function rebuildFile(layout: OpusLayout, packet: Buffer): Buffer {
  const serial = layout.head[0].page.serial;
  const tagPages = pagesForPacket(packet, serial, layout.head.length, 0, 0);
  const sequenceBase = layout.head.length + tagPages.length;
  return Buffer.concat([
    ...layout.head.map((entry) => writePage(entry.page)),
    ...tagPages.map(writePage),
    ...layout.rest.map((entry, index) =>
      writePage({ ...entry.page, sequence: sequenceBase + index }),
    ),
  ]);
}

function padPacket(packet: Buffer, totalBytes: number): Buffer {
  const padded = Buffer.alloc(totalBytes);
  packet.copy(padded, 0);
  return padded;
}

function verifyPrefix(expected: Buffer): (path: string) => Promise<void> {
  return async (path: string) => {
    const handle = await open(path, 'r');
    try {
      const actual = Buffer.alloc(expected.length);
      const { bytesRead } = await handle.read(actual, 0, expected.length, 0);
      if (bytesRead !== expected.length || !actual.equals(expected)) {
        throw new Error(`${path} does not start with the expected Ogg headers`);
      }
    } finally {
      await handle.close();
    }
  };
}

async function updateOpusComments(
  absolutePath: string,
  transform: (comments: VorbisComment[]) => VorbisComment[],
): Promise<void> {
  const data = await readFile(absolutePath);
  const layout = readOpusLayout(data);
  const parsed = parseVorbisCommentPacket(layout.tagPacket.subarray(8));
  const packet = Buffer.concat([
    OPUS_TAGS,
    serializeVorbisCommentPacket(parsed.vendor, transform(parsed.comments)),
  ]);

  // Padding the packet back to its original length keeps the segment tables, and
  // therefore every page size and every audio byte offset, unchanged. Only the tag
  // pages need rewriting, which a client streaming the file never notices.
  if (packet.length <= layout.tagPacket.length) {
    const region = rebuildPagesInPlace(
      layout.tags,
      padPacket(packet, layout.tagPacket.length),
    );
    if (region.length === layout.tagEnd - layout.tagStart) {
      await safePatchRegion(absolutePath, region, layout.tagStart);
      return;
    }
  }

  const grown = rebuildFile(
    layout,
    padPacket(packet, packet.length + RESERVED_PADDING_BYTES),
  );
  await safeReplaceWithBuffer(absolutePath, grown, {
    verify: verifyPrefix(grown.subarray(0, Math.min(grown.length, 65536))),
  });
}

export async function writeOpusMetadata(
  absolutePath: string,
  metadata: VorbisMetadataInput,
): Promise<void> {
  await updateOpusComments(absolutePath, (comments) =>
    applyMetadataComments(comments, metadata),
  );
}

export async function writeOpusRating(
  absolutePath: string,
  rating: number,
): Promise<void> {
  await updateOpusComments(absolutePath, (comments) =>
    setRatingComment(comments, rating),
  );
}
