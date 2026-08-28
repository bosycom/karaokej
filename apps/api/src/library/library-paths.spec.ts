import { describe, expect, it } from 'vitest';
import {
  assignLibraryKeys,
  buildLibraryPathLayout,
  collapseNestedRoots,
  parseLibraryPathEntries,
  parseStoredScanRoots,
  prefixCataloguePath,
  resolveUnderLibraries,
  sameRootSet,
  serializeStoredScanRoots,
  stripCataloguePath,
} from './library-paths';

describe('parseLibraryPathEntries', () => {
  const repoRoot = '/repo';

  it('parses comma-separated paths', () => {
    expect(
      parseLibraryPathEntries('/mnt/a/Music, /mnt/b/Karaoke', repoRoot),
    ).toEqual(['/mnt/a/Music', '/mnt/b/Karaoke']);
  });

  it('dedupes identical paths', () => {
    expect(
      parseLibraryPathEntries('/mnt/music, /mnt/music', repoRoot),
    ).toEqual(['/mnt/music']);
  });

  it('drops nested roots', () => {
    expect(
      parseLibraryPathEntries('/mnt/music, /mnt/music/Artists', repoRoot),
    ).toEqual(['/mnt/music']);
  });

  it('resolves relative paths from repo root', () => {
    expect(parseLibraryPathEntries('./sample-music', repoRoot)).toEqual([
      '/repo/sample-music',
    ]);
  });
});

describe('assignLibraryKeys', () => {
  it('uses basename and disambiguates collisions', () => {
    const keys = assignLibraryKeys(['/mnt/a/Music', '/mnt/b/Music']);
    expect(keys.get('/mnt/a/Music')).toBe('Music');
    expect(keys.get('/mnt/b/Music')).toBe('b_Music');
  });

  it('is stable regardless of input order', () => {
    const keysA = assignLibraryKeys(['/mnt/a/Music', '/mnt/b/Karaoke']);
    const keysB = assignLibraryKeys(['/mnt/b/Karaoke', '/mnt/a/Music']);
    expect(keysA.get('/mnt/a/Music')).toBe(keysB.get('/mnt/a/Music'));
    expect(keysA.get('/mnt/b/Karaoke')).toBe(keysB.get('/mnt/b/Karaoke'));
  });
});

describe('prefixCataloguePath', () => {
  it('does not prefix for a single root', () => {
    expect(prefixCataloguePath('Music', 'Rock/song.mp3', false)).toBe(
      'Rock/song.mp3',
    );
  });

  it('prefixes for multiple roots', () => {
    expect(prefixCataloguePath('Music', 'Rock/song.mp3', true)).toBe(
      'Music/Rock/song.mp3',
    );
  });
});

describe('stripCataloguePath', () => {
  it('strips a known key prefix', () => {
    expect(stripCataloguePath('Music', 'Music/Rock/song.mp3')).toBe(
      'Rock/song.mp3',
    );
  });

  it('returns null when prefix does not match', () => {
    expect(stripCataloguePath('Music', 'Karaoke/song.mp3')).toBeNull();
  });
});

describe('resolveUnderLibraries', () => {
  it('resolves against a single root', () => {
    const layout = buildLibraryPathLayout(['/mnt/music']);
    expect(resolveUnderLibraries('Rock/song.mp3', layout)).toBe(
      '/mnt/music/Rock/song.mp3',
    );
  });

  it('resolves prefixed paths for multiple roots', () => {
    const layout = buildLibraryPathLayout(['/mnt/a/Music', '/mnt/b/Karaoke']);
    const key = layout.keys.get('/mnt/a/Music')!;
    expect(
      resolveUnderLibraries(`${key}/Rock/song.mp3`, layout),
    ).toBe('/mnt/a/Music/Rock/song.mp3');
  });

  it('resolves unprefixed paths during transition', () => {
    const layout = buildLibraryPathLayout(['/mnt/a/Music', '/mnt/b/Karaoke']);
    expect(
      resolveUnderLibraries('Rock/song.mp3', layout, '/mnt/a/Music'),
    ).toBe('/mnt/a/Music/Rock/song.mp3');
  });
});

describe('stored scan roots', () => {
  it('parses a single plain path', () => {
    expect(parseStoredScanRoots('/mnt/music')).toEqual(['/mnt/music']);
  });

  it('parses a JSON array', () => {
    expect(parseStoredScanRoots('["/mnt/a/Music","/mnt/b/Karaoke"]')).toEqual([
      '/mnt/a/Music',
      '/mnt/b/Karaoke',
    ]);
  });

  it('serializes multiple roots as JSON', () => {
    expect(
      serializeStoredScanRoots(['/mnt/a/Music', '/mnt/b/Karaoke']),
    ).toBe('["/mnt/a/Music","/mnt/b/Karaoke"]');
  });

  it('serializes a single root as plain text', () => {
    expect(serializeStoredScanRoots(['/mnt/music'])).toBe('/mnt/music');
  });
});

describe('sameRootSet', () => {
  it('compares root sets regardless of order', () => {
    expect(
      sameRootSet(['/mnt/b/Karaoke', '/mnt/a/Music'], [
        '/mnt/a/Music',
        '/mnt/b/Karaoke',
      ]),
    ).toBe(true);
  });
});
