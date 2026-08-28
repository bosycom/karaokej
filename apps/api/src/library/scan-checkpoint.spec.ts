import { describe, expect, it } from 'vitest';
import {
  checkpointMatchesRoots,
  parseScanCheckpoint,
} from './scan-checkpoint';

describe('parseScanCheckpoint', () => {
  it('parses the multi-root checkpoint shape', () => {
    expect(
      parseScanCheckpoint(
        JSON.stringify({
          roots: ['/mnt/a/Music', '/mnt/b/Karaoke'],
          rootIndex: 1,
          completedGroups: ['Rock'],
        }),
      ),
    ).toEqual({
      roots: ['/mnt/a/Music', '/mnt/b/Karaoke'],
      rootIndex: 1,
      completedGroups: ['Rock'],
    });
  });

  it('accepts the legacy single-root checkpoint shape', () => {
    expect(
      parseScanCheckpoint(
        JSON.stringify({
          root: '/mnt/music',
          completedGroups: ['Rock'],
        }),
      ),
    ).toEqual({
      roots: ['/mnt/music'],
      rootIndex: 0,
      completedGroups: ['Rock'],
    });
  });
});

describe('checkpointMatchesRoots', () => {
  it('matches root sets regardless of order', () => {
    const checkpoint = {
      roots: ['/mnt/b/Karaoke', '/mnt/a/Music'],
      rootIndex: 0,
      completedGroups: [],
    };
    expect(
      checkpointMatchesRoots(checkpoint, ['/mnt/a/Music', '/mnt/b/Karaoke']),
    ).toBe(true);
  });

  it('rejects mismatched root sets', () => {
    const checkpoint = {
      roots: ['/mnt/music'],
      rootIndex: 0,
      completedGroups: [],
    };
    expect(
      checkpointMatchesRoots(checkpoint, ['/mnt/music', '/mnt/karaoke']),
    ).toBe(false);
  });
});
