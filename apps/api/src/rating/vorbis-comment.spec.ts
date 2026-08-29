import { describe, expect, it } from 'vitest';
import {
  applyMetadataComments,
  parseVorbisCommentPacket,
  serializeVorbisCommentPacket,
} from './vorbis-comment';

describe('applyMetadataComments', () => {
  it('replaces known metadata keys and preserves other comments', () => {
    const comments = applyMetadataComments(
      [
        { key: 'CUSTOM', value: 'keep-me' },
        { key: 'ARTIST', value: 'Old Artist' },
      ],
      {
        title: 'New Title',
        artist: 'New Artist',
        album: 'New Album',
        albumArtist: 'Various',
        trackNo: 3,
        year: 2001,
        genres: ['Pop', 'Dance'],
        rating: 8,
      },
    );
    expect(comments).toContainEqual({ key: 'CUSTOM', value: 'keep-me' });
    expect(comments).toContainEqual({ key: 'TITLE', value: 'New Title' });
    expect(comments).toContainEqual({ key: 'ARTIST', value: 'New Artist' });
    expect(comments).toContainEqual({ key: 'ALBUM', value: 'New Album' });
    expect(comments).toContainEqual({ key: 'RATING', value: '8' });
  });

  it('round-trips through vorbis comment serialization', () => {
    const packet = serializeVorbisCommentPacket(
      'test-vendor',
      applyMetadataComments([], {
        title: 'Song',
        artist: 'Singer',
        album: null,
        albumArtist: null,
        trackNo: null,
        year: null,
        genres: [],
        rating: 0,
      }),
    );
    const parsed = parseVorbisCommentPacket(packet);
    expect(parsed.comments).toContainEqual({ key: 'TITLE', value: 'Song' });
    expect(parsed.comments).toContainEqual({ key: 'ARTIST', value: 'Singer' });
  });
});
