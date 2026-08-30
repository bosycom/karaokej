import { describe, expect, it } from 'vitest';
import {
  hasMpegFrameSync,
  padId3Tag,
  readId3Region,
  withReservedTagPadding,
} from './id3-region';

function tag(sizeBytes: number, flags = 0): Buffer {
  const hasFooter = (flags & 0x10) !== 0;
  const buffer = Buffer.alloc(10 + sizeBytes + (hasFooter ? 10 : 0));
  buffer.write('ID3', 0, 'latin1');
  buffer[3] = 3;
  buffer[5] = flags;
  buffer[6] = (sizeBytes >>> 21) & 0x7f;
  buffer[7] = (sizeBytes >>> 14) & 0x7f;
  buffer[8] = (sizeBytes >>> 7) & 0x7f;
  buffer[9] = sizeBytes & 0x7f;
  return buffer;
}

describe('readId3Region', () => {
  it('reads the tag length from the synchsafe header', () => {
    expect(readId3Region(tag(200))?.totalBytes).toBe(210);
  });

  it('decodes sizes above 127 bytes', () => {
    expect(readId3Region(tag(4096))?.totalBytes).toBe(4106);
  });

  it('returns null without an ID3v2 tag', () => {
    expect(readId3Region(Buffer.from([0xff, 0xfb, 0x90, 0x00]))).toBeNull();
  });

  it('counts the footer and refuses to pad the tag', () => {
    const region = readId3Region(tag(200, 0x10));

    expect(region?.totalBytes).toBe(220);
    expect(region?.paddable).toBe(false);
  });

  it('refuses to pad an unsynchronised tag', () => {
    expect(readId3Region(tag(200, 0x80))?.paddable).toBe(false);
  });
});

describe('padId3Tag', () => {
  it('grows the declared size and zero-fills the padding', () => {
    const padded = padId3Tag(tag(100), 4096);

    expect(padded).not.toBeNull();
    expect(padded!.length).toBe(4096);
    expect(readId3Region(padded!)?.totalBytes).toBe(4096);
    expect(padded!.subarray(110).every((byte) => byte === 0)).toBe(true);
  });

  it('returns null when the frames do not fit', () => {
    expect(padId3Tag(tag(4096), 200)).toBeNull();
  });

  it('returns null for a tag that cannot carry padding', () => {
    expect(padId3Tag(tag(100, 0x10), 4096)).toBeNull();
  });
});

describe('withReservedTagPadding', () => {
  it('reserves padding and leaves the audio bytes in place', () => {
    const audio = Buffer.from([0xff, 0xfb, 0x90, 0x00, 0x11, 0x22]);
    const file = Buffer.concat([tag(100), audio]);

    const grown = withReservedTagPadding(file);
    const region = readId3Region(grown)!;

    expect(region.totalBytes).toBe(110 + 4096);
    expect(grown.subarray(region.totalBytes)).toEqual(audio);
  });
});

describe('hasMpegFrameSync', () => {
  it('accepts a frame header', () => {
    expect(hasMpegFrameSync(Buffer.from([0x00, 0xff, 0xfb]), 1)).toBe(true);
  });

  it('rejects anything else', () => {
    expect(hasMpegFrameSync(Buffer.from([0xff, 0x0b]), 0)).toBe(false);
    expect(hasMpegFrameSync(Buffer.from([0xff]), 0)).toBe(false);
  });
});
