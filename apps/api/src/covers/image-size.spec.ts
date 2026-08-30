import { describe, expect, it } from 'vitest';
import { readImageSize } from './image-size';

function pngHeader(width: number, height: number): Buffer {
  const buf = Buffer.alloc(24);
  buf.writeUInt32BE(0x89504e47, 0);
  buf.writeUInt32BE(0x0d0a1a0a, 4);
  buf.write('IHDR', 12, 'ascii');
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}

function jpegHeader(width: number, height: number): Buffer {
  const buf = Buffer.alloc(20);
  buf.writeUInt16BE(0xffd8, 0);
  buf.writeUInt16BE(0xffc0, 2);
  buf.writeUInt16BE(17, 4);
  buf.writeUInt8(8, 6);
  buf.writeUInt16BE(height, 7);
  buf.writeUInt16BE(width, 9);
  return buf;
}

function gifHeader(width: number, height: number): Buffer {
  const buf = Buffer.alloc(10);
  buf.write('GIF89a', 0, 'ascii');
  buf.writeUInt16LE(width, 6);
  buf.writeUInt16LE(height, 8);
  return buf;
}

describe('readImageSize', () => {
  it('reads PNG dimensions', () => {
    expect(readImageSize(pngHeader(1000, 1000))).toEqual({
      width: 1000,
      height: 1000,
    });
  });

  it('reads JPEG dimensions from the frame header', () => {
    expect(readImageSize(jpegHeader(1400, 900))).toEqual({
      width: 1400,
      height: 900,
    });
  });

  it('reads GIF dimensions', () => {
    expect(readImageSize(gifHeader(300, 200))).toEqual({
      width: 300,
      height: 200,
    });
  });

  it('returns null for unrecognised data rather than throwing', () => {
    expect(readImageSize(Buffer.from('not an image at all'))).toBeNull();
    expect(readImageSize(Buffer.alloc(0))).toBeNull();
  });
});
