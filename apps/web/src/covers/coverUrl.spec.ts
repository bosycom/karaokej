import { describe, expect, it } from 'vitest';
import { coverUrl, hasResolvedCover } from './coverUrl';

const resolved = {
  coverGroup: 'abc123def4567890',
  coverVersion: 'f'.repeat(64),
  coverStatus: 'ready' as const,
};

describe('coverUrl', () => {
  it('pins the content hash so the response can be cached forever', () => {
    expect(coverUrl(resolved, 'sm')).toBe(
      `/api/covers/abc123def4567890/sm?v=${'f'.repeat(64)}`,
    );
  });

  it('uses one URL per album so a page of tracks makes a single request', () => {
    const trackA = { ...resolved };
    const trackB = { ...resolved };
    expect(coverUrl(trackA, 'sm')).toBe(coverUrl(trackB, 'sm'));
  });

  it('serves distinct URLs per size', () => {
    expect(coverUrl(resolved, 'sm')).not.toBe(coverUrl(resolved, 'lg'));
  });

  it('omits the version while the album is still unresolved', () => {
    const pending = {
      coverGroup: 'abc123def4567890',
      coverVersion: null,
      coverStatus: 'pending' as const,
    };
    expect(coverUrl(pending, 'sm')).toBe('/api/covers/abc123def4567890/sm');
  });

  it('returns null when the album is known to have no artwork', () => {
    expect(
      coverUrl(
        { coverGroup: 'abc123def4567890', coverVersion: null, coverStatus: 'none' },
        'sm',
      ),
    ).toBeNull();
  });

  it('returns null before a track has been assigned a group', () => {
    expect(
      coverUrl({ coverGroup: null, coverVersion: null, coverStatus: 'pending' }, 'sm'),
    ).toBeNull();
  });
});

describe('hasResolvedCover', () => {
  it('is true only once artwork and its hash are known', () => {
    expect(hasResolvedCover(resolved)).toBe(true);
    expect(
      hasResolvedCover({ ...resolved, coverStatus: 'pending', coverVersion: null }),
    ).toBe(false);
    expect(hasResolvedCover({ ...resolved, coverStatus: 'none' })).toBe(false);
  });
});
