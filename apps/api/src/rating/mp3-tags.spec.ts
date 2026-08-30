import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import NodeID3 from 'node-id3';
import { readId3Region } from './id3-region';
import { writeMp3Rating } from './mp3-tags';
import { internalToPopm } from './rating-scale';

/** A frame header followed by filler, enough to stand in for audio data. */
const AUDIO = Buffer.concat([
  Buffer.from([0xff, 0xfb, 0x90, 0x00]),
  Buffer.alloc(2048, 0x55),
]);

function audioOf(file: Buffer): Buffer {
  const region = readId3Region(file);
  return region ? file.subarray(region.totalBytes) : file;
}

function ratingOf(file: Buffer): number | undefined {
  return NodeID3.read(file).popularimeter?.rating;
}

describe('writeMp3Rating', () => {
  let dir: string;
  let target: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mp3-tags-'));
    target = join(dir, 'song.mp3');
    writeFileSync(target, AUDIO);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const siblings = () => readdirSync(dir).filter((name) => name !== 'song.mp3');

  it('adds a tag with reserved padding when the file has none', async () => {
    await writeMp3Rating(target, 8);

    const written = readFileSync(target);
    const region = readId3Region(written);
    expect(region).not.toBeNull();
    expect(region!.totalBytes).toBeGreaterThan(4096);
    expect(audioOf(written)).toEqual(AUDIO);
    expect(ratingOf(written)).toBe(internalToPopm(8));
    expect(siblings()).toEqual([]);
  });

  it('keeps the file length and audio offset on later changes', async () => {
    await writeMp3Rating(target, 8);
    const first = readFileSync(target);
    const firstRegion = readId3Region(first)!;

    await writeMp3Rating(target, 2);

    const second = readFileSync(target);
    expect(second.length).toBe(first.length);
    expect(readId3Region(second)!.totalBytes).toBe(firstRegion.totalBytes);
    expect(audioOf(second)).toEqual(AUDIO);
    expect(ratingOf(second)).toBe(internalToPopm(2));
    expect(siblings()).toEqual([]);
  });

  it('preserves tags it does not manage', async () => {
    const tagged = NodeID3.update({ title: 'Asylum Walk', artist: 'Declaime' }, AUDIO);
    if (tagged instanceof Error) {
      throw tagged;
    }
    writeFileSync(target, tagged);

    await writeMp3Rating(target, 10);

    const written = readFileSync(target);
    const tags = NodeID3.read(written);
    expect(tags.title).toBe('Asylum Walk');
    expect(tags.artist).toBe('Declaime');
    expect(tags.popularimeter?.rating).toBe(internalToPopm(10));
    expect(audioOf(written)).toEqual(AUDIO);
  });

  it('keeps the play counter across rating changes', async () => {
    const tagged = NodeID3.update(
      {
        popularimeter: {
          email: 'Windows Media Player 9 Series',
          rating: 128,
          counter: 17,
        },
      },
      AUDIO,
    );
    if (tagged instanceof Error) {
      throw tagged;
    }
    writeFileSync(target, tagged);

    await writeMp3Rating(target, 4);

    expect(NodeID3.read(readFileSync(target)).popularimeter?.counter).toBe(17);
  });
});
