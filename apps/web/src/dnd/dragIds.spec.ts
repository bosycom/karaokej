import { describe, expect, it } from 'vitest';
import {
  parseDragId,
  playlistDetailDropId,
  playlistIdForAccept,
  playlistItemDragId,
} from './dragIds';

describe('parseDragId', () => {
  it('treats playlist detail targets as playlist drops', () => {
    expect(parseDragId(playlistDetailDropId(7))).toEqual({ kind: 'playlist', id: 7 });
  });
});

describe('playlistIdForAccept', () => {
  it('uses the playlist id from a playlist drop target', () => {
    expect(playlistIdForAccept('playlist:4', 9)).toBe(4);
    expect(playlistIdForAccept(playlistDetailDropId(4), 9)).toBe(4);
  });

  it('uses the selected playlist when dropping on a playlist item', () => {
    expect(playlistIdForAccept(playlistItemDragId(12), 5)).toBe(5);
    expect(playlistIdForAccept(playlistItemDragId(12), null)).toBeNull();
  });

  it('ignores queue targets', () => {
    expect(playlistIdForAccept('queue:3', 5)).toBeNull();
  });
});
