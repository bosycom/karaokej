import { describe, expect, it } from 'vitest';
import { formatTrackSubtitle, karaokeStemBadge } from './format';

describe('formatTrackSubtitle', () => {
  it('shows artist and album with year in parentheses', () => {
    expect(
      formatTrackSubtitle({
        artist: 'Armand van Helden',
        album: 'Nympho',
        year: 1999,
        genres: [],
      }),
    ).toBe('Armand van Helden · Nympho (1999)');
  });

  it('shows year only when album is missing', () => {
    expect(
      formatTrackSubtitle({
        artist: 'Artist',
        album: null,
        year: 2005,
        genres: [],
      }),
    ).toBe('Artist · 2005');
  });

  it('shows album without year when year is missing', () => {
    expect(
      formatTrackSubtitle({
        artist: 'Artist',
        album: 'Album',
        year: null,
        genres: [],
      }),
    ).toBe('Artist · Album');
  });

  it('shows up to three genres', () => {
    expect(
      formatTrackSubtitle({
        artist: 'Artist',
        album: 'Album',
        year: 1999,
        genres: ['House', 'Disco', 'Funk'],
      }),
    ).toBe('Artist · Album (1999) · House, Disco, Funk');
  });

  it('appends +N when more than three genres', () => {
    expect(
      formatTrackSubtitle({
        artist: 'Artist',
        album: 'Album',
        year: 1999,
        genres: ['House', 'Disco', 'Funk', 'Pop'],
      }),
    ).toBe('Artist · Album (1999) · House, Disco, Funk +1');
  });

  it('uses Unknown artist when artist is null', () => {
    expect(
      formatTrackSubtitle({
        artist: null,
        album: null,
        year: null,
        genres: ['Rock'],
      }),
    ).toBe('Unknown artist · Rock');
  });
});

describe('karaokeStemBadge', () => {
  it('returns ready badge', () => {
    expect(karaokeStemBadge('ready')).toMatchObject({
      label: 'AI stem',
      tone: 'ok',
      show: true,
    });
  });

  it('returns pending badge', () => {
    expect(karaokeStemBadge('pending')).toMatchObject({
      label: 'Queued',
      tone: 'muted',
      show: true,
    });
  });

  it('returns processing badge with animation flag', () => {
    expect(karaokeStemBadge('processing')).toMatchObject({
      label: 'Separating…',
      tone: 'warn',
      show: true,
      processing: true,
    });
  });

  it('returns null for hidden statuses', () => {
    expect(karaokeStemBadge(null)).toBeNull();
    expect(karaokeStemBadge('none')).toBeNull();
    expect(karaokeStemBadge('failed')).toBeNull();
    expect(karaokeStemBadge('unsupported')).toBeNull();
  });
});
