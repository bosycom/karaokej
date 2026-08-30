import { describe, expect, it } from 'vitest';
import { mapDeezerTopTracks, pickDeezerArtist } from './deezer-utils';

describe('deezer-utils', () => {
  it('picks an exact case-insensitive artist match', () => {
    const picked = pickDeezerArtist(
      [
        { id: 1, name: 'Nirvana Tribute' },
        { id: 2, name: 'Nirvana' },
      ],
      'nirvana',
    );
    expect(picked?.id).toBe(2);
  });

  it('falls back to the first artist when there is no exact match', () => {
    const picked = pickDeezerArtist(
      [
        { id: 1, name: 'Nirvana Tribute' },
        { id: 2, name: 'Nirvana UK' },
      ],
      'Nirvana',
    );
    expect(picked?.id).toBe(1);
  });

  it('maps top tracks and caps at the requested limit', () => {
    expect(
      mapDeezerTopTracks(
        [
          { title: 'Smells Like Teen Spirit' },
          { title: '  ' },
          { title: 'Come as You Are' },
          { title: 'Lithium' },
        ],
        2,
      ),
    ).toEqual([
      { name: 'Smells Like Teen Spirit' },
      { name: 'Come as You Are' },
    ]);
  });
});
