import { describe, expect, it } from 'vitest';
import {
  detectRootChange,
  hasPathRebaseConflicts,
  planPathRebase,
  prefixRelativePath,
  projectedPathsAfterRebase,
  stripRelativePath,
} from './scan-root';

describe('detectRootChange', () => {
  it('detects expanded and narrowed roots', () => {
    expect(
      detectRootChange('/mnt/music/Artists', '/mnt/music'),
    ).toEqual({ kind: 'expanded', prefix: 'Artists' });

    expect(
      detectRootChange('/mnt/music', '/mnt/music/Artists'),
    ).toEqual({ kind: 'narrowed', stripPrefix: 'Artists' });
  });
});

describe('planPathRebase idempotency', () => {
  it('skips rows that already have the expanded prefix', () => {
    const rows = [
      { id: 1, relative_path: 'Artists/Queen/song.mp3' },
      { id: 2, relative_path: 'Queen/song.mp3' },
    ];
    const plan = planPathRebase(rows, { kind: 'expanded', prefix: 'Artists' });
    expect(plan).toEqual({
      updates: [{ id: 2, relative_path: 'Artists/Queen/song.mp3' }],
    });
  });

  it('skips rows that no longer have the narrowed prefix', () => {
    const rows = [
      { id: 1, relative_path: 'Artists/Queen/song.mp3' },
      { id: 2, relative_path: 'Queen/song.mp3' },
    ];
    const plan = planPathRebase(rows, {
      kind: 'narrowed',
      stripPrefix: 'Artists',
    });
    expect(plan).toEqual({
      updates: [{ id: 1, relative_path: 'Queen/song.mp3' }],
    });
  });

  it('returns an empty plan when a partial rebase already finished', () => {
    const rows = [{ id: 1, relative_path: 'Artists/Queen/song.mp3' }];
    const plan = planPathRebase(rows, { kind: 'expanded', prefix: 'Artists' });
    expect(plan).toEqual({ updates: [] });
  });

  it('detects duplicate target paths', () => {
    const rows = [
      { id: 1, relative_path: 'a/song.mp3' },
      { id: 2, relative_path: 'a/song.mp3' },
    ];
    expect(
      planPathRebase(rows, { kind: 'expanded', prefix: 'Artists' }),
    ).toBeNull();
  });
});

describe('hasPathRebaseConflicts', () => {
  it('flags collisions with unchanged rows', () => {
    const rows = [
      { id: 1, relative_path: 'shared/song.mp3' },
      { id: 2, relative_path: 'Queen/song.mp3' },
    ];
    const plan = {
      updates: [{ id: 2, relative_path: 'shared/song.mp3' }],
    };
    expect(hasPathRebaseConflicts(rows, plan)).toBe(true);
  });
});

describe('projectedPathsAfterRebase', () => {
  it('includes unchanged rows in the final path map', () => {
    const rows = [
      { id: 1, relative_path: 'Artists/Queen/song.mp3' },
      { id: 2, relative_path: 'Queen/song.mp3' },
    ];
    const plan = planPathRebase(rows, { kind: 'expanded', prefix: 'Artists' })!;
    const projected = projectedPathsAfterRebase(rows, plan);
    expect(projected.get(1)).toBe('Artists/Queen/song.mp3');
    expect(projected.get(2)).toBe('Artists/Queen/song.mp3');
  });
});

describe('path helpers', () => {
  it('prefixes and strips relative paths', () => {
    expect(prefixRelativePath('Artists', 'Queen/song.mp3')).toBe(
      'Artists/Queen/song.mp3',
    );
    expect(stripRelativePath('Artists', 'Artists/Queen/song.mp3')).toBe(
      'Queen/song.mp3',
    );
  });
});
