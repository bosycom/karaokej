import { describe, expect, it } from 'vitest';
import {
  BIOGRAPHY_MAX_CHARS,
  biographyFromArtistRecord,
  hasLocalArtistAmbiguity,
  localArtistChoices,
  mbidLookupKey,
  nameLookupKey,
  preferredArtistName,
  searchNameVariants,
  stripFeaturing,
  truncateBiography,
} from './artist-bio-utils';

describe('artist-bio-utils', () => {
  it('prefers album artist over track artist', () => {
    expect(
      preferredArtistName({
        artist: 'Guest Singer',
        albumArtist: 'Main Band',
      }),
    ).toBe('Main Band');
  });

  it('skips various artists album artist', () => {
    expect(
      preferredArtistName({
        artist: 'Real Artist',
        albumArtist: 'Various Artists',
      }),
    ).toBe('Real Artist');
  });

  it('strips featuring suffixes', () => {
    expect(stripFeaturing('Artist feat. Guest')).toBe('Artist');
    expect(stripFeaturing('Artist ft. Guest')).toBe('Artist');
  });

  it('detects local ambiguity when artist and album artist differ', () => {
    expect(
      hasLocalArtistAmbiguity({
        artist: 'Track Artist',
        albumArtist: 'Album Artist',
      }),
    ).toBe(true);
    expect(localArtistChoices({
      artist: 'Track Artist',
      albumArtist: 'Album Artist',
    })).toEqual(['Album Artist', 'Track Artist']);
  });

  it('builds lookup keys', () => {
    expect(mbidLookupKey('CC197BAD-DC9C-440D-A5B5-D52BA2E14234')).toBe(
      'mbid:cc197bad-dc9c-440d-a5b5-d52ba2e14234',
    );
    expect(nameLookupKey('The Beatles')).toBe('name:the beatles');
  });

  it('adds a variant without leading The', () => {
    expect(searchNameVariants('The Beatles')).toEqual(['The Beatles', 'Beatles']);
  });

  it('reads biography from strBiographyEN or strBiography', () => {
    expect(
      biographyFromArtistRecord({ strBiographyEN: ' English bio ' }),
    ).toBe('English bio');
    expect(
      biographyFromArtistRecord({ strBiography: 'Base bio' }),
    ).toBe('Base bio');
  });

  it('truncates biography at 65535 characters', () => {
    const long = 'a'.repeat(BIOGRAPHY_MAX_CHARS + 10);
    const truncated = truncateBiography(long);
    expect(truncated.length).toBe(BIOGRAPHY_MAX_CHARS);
    expect(truncated.endsWith('…')).toBe(true);
  });
});
