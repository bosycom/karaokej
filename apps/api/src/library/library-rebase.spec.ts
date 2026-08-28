import { describe, expect, it } from 'vitest';
import {
  planKeyPrefixUpdates,
  planKeyStripUpdates,
  planMultiRootRebase,
} from './library-rebase';

describe('planKeyPrefixUpdates', () => {
  it('prefixes unprefixed catalogue paths', () => {
    const plan = planKeyPrefixUpdates(
      [{ id: 1, relative_path: 'Rock/song.mp3' }],
      'Music',
      new Set(['Music', 'Karaoke']),
    );
    expect(plan).toEqual([
      { id: 1, relative_path: 'Music/Rock/song.mp3' },
    ]);
  });

  it('skips rows that already have a library key', () => {
    const plan = planKeyPrefixUpdates(
      [{ id: 1, relative_path: 'Music/Rock/song.mp3' }],
      'Music',
      new Set(['Music', 'Karaoke']),
    );
    expect(plan).toEqual([]);
  });
});

describe('planKeyStripUpdates', () => {
  it('strips a library key prefix', () => {
    const plan = planKeyStripUpdates(
      [{ id: 1, relative_path: 'Music/Rock/song.mp3' }],
      'Music',
    );
    expect(plan).toEqual([{ id: 1, relative_path: 'Rock/song.mp3' }]);
  });
});

describe('planMultiRootRebase', () => {
  const rows = [{ id: 1, relative_path: 'Rock/song.mp3' }];

  it('prefixes paths when expanding from one root to many', () => {
    const plan = planMultiRootRebase(
      ['/mnt/music'],
      ['/mnt/music', '/mnt/karaoke'],
      rows,
    );
    expect(plan?.pathUpdates).toEqual([
      { id: 1, relative_path: 'music/Rock/song.mp3' },
    ]);
    expect(plan?.storedRootsAfter).toEqual([
      '/mnt/music',
      '/mnt/karaoke',
    ]);
  });

  it('strips prefixes when reducing from many roots to one', () => {
    const plan = planMultiRootRebase(
      ['/mnt/music', '/mnt/karaoke'],
      ['/mnt/music'],
      [{ id: 1, relative_path: 'music/Rock/song.mp3' }],
    );
    expect(plan?.pathUpdates).toEqual([
      { id: 1, relative_path: 'Rock/song.mp3' },
    ]);
  });

  it('rebases a single root parent/child change', () => {
    const plan = planMultiRootRebase(
      ['/mnt/music'],
      ['/mnt/music/Artists'],
      [{ id: 1, relative_path: 'Artists/Queen/song.mp3' }],
    );
    expect(plan?.pathUpdates).toEqual([
      { id: 1, relative_path: 'Queen/song.mp3' },
    ]);
  });

  it('warns on unrelated replacement', () => {
    const plan = planMultiRootRebase(
      ['/mnt/old'],
      ['/mnt/new'],
      rows,
    );
    expect(plan?.clearCheckpoint).toBe(true);
    expect(plan?.warnMessage).toContain('unrelated');
  });
});
