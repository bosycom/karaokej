import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import {
  buildDemucsArgs,
  parseDemucsProgress,
  resolveStemOutputPath,
} from './demucs-cli';

describe('buildDemucsArgs', () => {
  it('builds two-stem vocal separation args', () => {
    expect(
      buildDemucsArgs({
        model: 'htdemucs',
        inputPath: '/music/song.mp3',
        outputDir: '/tmp/out',
        extraArgs: ['--device', 'cpu'],
      }),
    ).toEqual([
      '--two-stems',
      'vocals',
      '--mp3',
      '--mp3-bitrate',
      '256',
      '-n',
      'htdemucs',
      '-o',
      '/tmp/out',
      '--device',
      'cpu',
      '/music/song.mp3',
    ]);
  });
});

describe('resolveStemOutputPath', () => {
  it('resolves no_vocals mp3 path', () => {
    expect(
      resolveStemOutputPath('/tmp/out', 'htdemucs', '/music/My Song.flac'),
    ).toBe(join('/tmp/out', 'htdemucs', 'My Song', 'no_vocals.mp3'));
  });
});

describe('parseDemucsProgress', () => {
  it('returns the last percent found in stderr chunk', () => {
    expect(parseDemucsProgress('loading model\n 42%|████')).toBe(42);
    expect(parseDemucsProgress('still running 88% done')).toBe(88);
  });

  it('returns null when no percent is present', () => {
    expect(parseDemucsProgress('starting separation')).toBeNull();
  });
});
