import { describe, expect, it } from 'vitest';
import {
  coverDirname,
  coverGroupKey,
  normalizeAlbumForGrouping,
} from './cover-group-key';

describe('coverDirname', () => {
  it('drops the file name and normalizes separators', () => {
    expect(coverDirname('Artist/Album/Song.mp3')).toBe('Artist/Album');
    expect(coverDirname('Artist\\Album\\Song.mp3')).toBe('Artist/Album');
  });

  it('returns an empty string for a file at the library root', () => {
    expect(coverDirname('Song.mp3')).toBe('');
  });
});

describe('normalizeAlbumForGrouping', () => {
  it('strips disc markers so multi-disc sets share one cover', () => {
    const base = normalizeAlbumForGrouping('The Wall');
    for (const variant of [
      'The Wall (Disc 1)',
      'The Wall [Disc 2]',
      'The Wall CD 2',
      'The Wall Vol. 3',
    ]) {
      expect(normalizeAlbumForGrouping(variant)).toBe(base);
    }
  });

  it('ignores case and diacritics', () => {
    expect(normalizeAlbumForGrouping('Björk Debut')).toBe(
      normalizeAlbumForGrouping('bjork  debut'),
    );
  });

  it('maps a missing album to an empty token', () => {
    expect(normalizeAlbumForGrouping(null)).toBe('');
    expect(normalizeAlbumForGrouping(undefined)).toBe('');
  });
});

describe('coverGroupKey', () => {
  it('groups every track of one album folder together', () => {
    const a = coverGroupKey('Artist/Album/01 One.mp3', 'Album');
    const b = coverGroupKey('Artist/Album/02 Two.mp3', 'Album');
    expect(a).toBe(b);
  });

  it('merges disc subfolders only when the folder matches', () => {
    const disc1 = coverGroupKey('Artist/Album/01 One.mp3', 'Album (Disc 1)');
    const disc2 = coverGroupKey('Artist/Album/09 Nine.mp3', 'Album (Disc 2)');
    expect(disc1).toBe(disc2);
  });

  it('separates different albums sharing a flat folder', () => {
    const first = coverGroupKey('Unsorted/One.mp3', 'First Album');
    const second = coverGroupKey('Unsorted/Two.mp3', 'Second Album');
    expect(first).not.toBe(second);
  });

  it('separates identically named albums in different folders', () => {
    const a = coverGroupKey('ArtistA/Greatest Hits/One.mp3', 'Greatest Hits');
    const b = coverGroupKey('ArtistB/Greatest Hits/One.mp3', 'Greatest Hits');
    expect(a).not.toBe(b);
  });

  it('keeps compilations together regardless of track artist', () => {
    const a = coverGroupKey('Various/Party Mix/01.mp3', 'Party Mix');
    const b = coverGroupKey('Various/Party Mix/02.mp3', 'Party Mix');
    expect(a).toBe(b);
  });

  it('falls back to the folder when the album tag is missing', () => {
    const a = coverGroupKey('Artist/Album/One.mp3', null);
    const b = coverGroupKey('Artist/Album/Two.mp3', null);
    const other = coverGroupKey('Artist/Other/Two.mp3', null);
    expect(a).toBe(b);
    expect(a).not.toBe(other);
  });

  it('produces a short stable hex key', () => {
    expect(coverGroupKey('Artist/Album/One.mp3', 'Album')).toMatch(
      /^[a-f0-9]{16}$/,
    );
  });
});
