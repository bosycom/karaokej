export interface VorbisComment {
  key: string;
  value: string;
}

export function parseVorbisCommentPacket(data: Buffer): {
  vendor: string;
  comments: VorbisComment[];
} {
  if (data.length < 8) {
    throw new Error('Vorbis comment packet is too short');
  }
  let offset = 0;
  const vendorLen = data.readUInt32LE(offset);
  offset += 4;
  if (offset + vendorLen + 4 > data.length) {
    throw new Error('Vorbis comment vendor is truncated');
  }
  const vendor = data.subarray(offset, offset + vendorLen).toString('utf8');
  offset += vendorLen;
  const count = data.readUInt32LE(offset);
  offset += 4;
  const comments: VorbisComment[] = [];
  for (let i = 0; i < count; i += 1) {
    if (offset + 4 > data.length) {
      throw new Error('Vorbis comment list is truncated');
    }
    const len = data.readUInt32LE(offset);
    offset += 4;
    if (offset + len > data.length) {
      throw new Error('Vorbis comment entry is truncated');
    }
    const entry = data.subarray(offset, offset + len).toString('utf8');
    offset += len;
    const eq = entry.indexOf('=');
    if (eq <= 0) {
      continue;
    }
    comments.push({
      key: entry.slice(0, eq),
      value: entry.slice(eq + 1),
    });
  }
  return { vendor, comments };
}

export function serializeVorbisCommentPacket(
  vendor: string,
  comments: VorbisComment[],
): Buffer {
  const vendorBuf = Buffer.from(vendor, 'utf8');
  const parts = comments.map((comment) =>
    Buffer.from(`${comment.key}=${comment.value}`, 'utf8'),
  );
  const size =
    4 +
    vendorBuf.length +
    4 +
    parts.reduce((sum, part) => sum + 4 + part.length, 0);
  const out = Buffer.alloc(size);
  let offset = 0;
  out.writeUInt32LE(vendorBuf.length, offset);
  offset += 4;
  vendorBuf.copy(out, offset);
  offset += vendorBuf.length;
  out.writeUInt32LE(parts.length, offset);
  offset += 4;
  for (const part of parts) {
    out.writeUInt32LE(part.length, offset);
    offset += 4;
    part.copy(out, offset);
    offset += part.length;
  }
  return out;
}

export function setRatingComment(
  comments: VorbisComment[],
  rating: number,
): VorbisComment[] {
  const next = comments.filter((comment) => comment.key.toUpperCase() !== 'RATING');
  next.push({ key: 'RATING', value: String(rating) });
  return next;
}
