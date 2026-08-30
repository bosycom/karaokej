import { describe, expect, it } from 'vitest';
import { isCoverImageFile, pickFrontPicture, pickSidecarName } from './cover-source';

describe('isCoverImageFile', () => {
  it('accepts common artwork formats regardless of case', () => {
    expect(isCoverImageFile('cover.JPG')).toBe(true);
    expect(isCoverImageFile('folder.png')).toBe(true);
    expect(isCoverImageFile('front.webp')).toBe(true);
  });

  it('rejects non-images', () => {
    expect(isCoverImageFile('song.mp3')).toBe(false);
    expect(isCoverImageFile('lyrics.lrc')).toBe(false);
  });
});

describe('pickSidecarName', () => {
  const audio = 'Artist - Song';

  it('prefers an image named after the audio file', () => {
    expect(
      pickSidecarName(['cover.jpg', 'Artist - Song.jpg', 'song.mp3'], audio),
    ).toBe('Artist - Song.jpg');
  });

  it('falls back to conventional folder artwork names in priority order', () => {
    expect(pickSidecarName(['artwork.png', 'folder.jpg'], audio)).toBe(
      'folder.jpg',
    );
    expect(pickSidecarName(['front.png', 'cover.jpg'], audio)).toBe('cover.jpg');
  });

  it('uses a lone image whatever it is called', () => {
    expect(pickSidecarName(['SomeAlbumScan.png', 'song.mp3'], audio)).toBe(
      'SomeAlbumScan.png',
    );
  });

  it('refuses to guess between several unconventional images', () => {
    expect(pickSidecarName(['scan1.png', 'scan2.png'], audio)).toBeNull();
  });

  it('returns null when the folder holds no images', () => {
    expect(pickSidecarName(['song.mp3', 'song.lrc'], audio)).toBeNull();
  });
});

describe('pickFrontPicture', () => {
  const data = new Uint8Array([1]);

  it('prefers the picture tagged as a front cover', () => {
    const picked = pickFrontPicture([
      { data, type: 'Media (e.g. label side of CD)' },
      { data, type: 'Cover (front)' },
      { data, type: 'Cover (back)' },
    ]);
    expect(picked?.type).toBe('Cover (front)');
  });

  it('falls back to the first picture when none is labelled front', () => {
    const picked = pickFrontPicture([
      { data, type: 'Illustration' },
      { data, type: 'Cover (back)' },
    ]);
    expect(picked?.type).toBe('Illustration');
  });

  it('handles untyped pictures', () => {
    expect(pickFrontPicture([{ data }])).not.toBeNull();
  });

  it('returns null when there is no artwork', () => {
    expect(pickFrontPicture([])).toBeNull();
    expect(pickFrontPicture(undefined)).toBeNull();
  });
});
