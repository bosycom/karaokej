export interface ImageSize {
  width: number;
  height: number;
}

function pngSize(buf: Buffer): ImageSize | null {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) {
    return null;
  }
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function gifSize(buf: Buffer): ImageSize | null {
  if (buf.length < 10 || buf.toString('ascii', 0, 3) !== 'GIF') {
    return null;
  }
  return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
}

function bmpSize(buf: Buffer): ImageSize | null {
  if (buf.length < 26 || buf.toString('ascii', 0, 2) !== 'BM') {
    return null;
  }
  return {
    width: Math.abs(buf.readInt32LE(18)),
    height: Math.abs(buf.readInt32LE(22)),
  };
}

function webpSize(buf: Buffer): ImageSize | null {
  if (
    buf.length < 30 ||
    buf.toString('ascii', 0, 4) !== 'RIFF' ||
    buf.toString('ascii', 8, 12) !== 'WEBP'
  ) {
    return null;
  }
  const chunk = buf.toString('ascii', 12, 16);
  if (chunk === 'VP8X') {
    return {
      width: 1 + buf.readUIntLE(24, 3),
      height: 1 + buf.readUIntLE(27, 3),
    };
  }
  if (chunk === 'VP8 ') {
    return {
      width: buf.readUInt16LE(26) & 0x3fff,
      height: buf.readUInt16LE(28) & 0x3fff,
    };
  }
  if (chunk === 'VP8L') {
    const bits = buf.readUInt32LE(21);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1,
    };
  }
  return null;
}

const JPEG_SIZE_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

function jpegSize(buf: Buffer): ImageSize | null {
  if (buf.length < 4 || buf.readUInt16BE(0) !== 0xffd8) {
    return null;
  }
  let offset = 2;
  while (offset + 9 < buf.length) {
    if (buf[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buf[offset + 1]!;
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const length = buf.readUInt16BE(offset + 2);
    if (length < 2) {
      return null;
    }
    if (JPEG_SIZE_MARKERS.has(marker)) {
      return {
        height: buf.readUInt16BE(offset + 5),
        width: buf.readUInt16BE(offset + 7),
      };
    }
    offset += 2 + length;
  }
  return null;
}

/**
 * Reads dimensions straight from the file header so aspect-ratio handling does
 * not require an extra ffprobe subprocess per cover.
 */
export function readImageSize(buf: Buffer): ImageSize | null {
  const size =
    pngSize(buf) ?? jpegSize(buf) ?? webpSize(buf) ?? gifSize(buf) ?? bmpSize(buf);
  if (!size || size.width <= 0 || size.height <= 0) {
    return null;
  }
  return size;
}
