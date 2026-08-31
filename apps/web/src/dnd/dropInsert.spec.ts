import { describe, expect, it } from 'vitest';
import {
  beforeIdAfterHover,
  dropLineClass,
  pointerInsertsBefore,
  resolveCrossListDropLine,
} from './dropInsert';

describe('pointerInsertsBefore', () => {
  it('uses the top half of the row as before', () => {
    expect(pointerInsertsBefore(100, 40, 110)).toBe(true);
    expect(pointerInsertsBefore(100, 40, 130)).toBe(false);
  });
});

describe('beforeIdAfterHover', () => {
  const ids = [10, 20, 30];

  it('returns the hovered id when inserting before', () => {
    expect(beforeIdAfterHover(20, true, ids)).toBe(20);
  });

  it('returns the next id when inserting after a middle item', () => {
    expect(beforeIdAfterHover(20, false, ids)).toBe(30);
  });

  it('returns null when inserting after the last item', () => {
    expect(beforeIdAfterHover(30, false, ids)).toBeNull();
  });
});

describe('dropLineClass', () => {
  it('marks the item that the new song will sit before', () => {
    expect(
      dropLineClass(20, false, { list: 'queue', beforeId: 20 }, 'queue'),
    ).toBe('drop-line-before');
  });

  it('marks the last item when appending', () => {
    expect(
      dropLineClass(30, true, { list: 'playlist', beforeId: null }, 'playlist'),
    ).toBe('drop-line-after');
  });
});

describe('resolveCrossListDropLine', () => {
  it('inserts before a queue item', () => {
    expect(resolveCrossListDropLine('queue:20', true, [10, 20, 30], [])).toEqual({
      list: 'queue',
      beforeId: 20,
    });
  });

  it('appends when hovering the queue pane', () => {
    expect(resolveCrossListDropLine('queue-drop', true, [10], [])).toEqual({
      list: 'queue',
      beforeId: null,
    });
  });

  it('inserts after a playlist item by targeting the next id', () => {
    expect(
      resolveCrossListDropLine('playlist-item:2', false, [], [1, 2, 3]),
    ).toEqual({
      list: 'playlist',
      beforeId: 3,
    });
  });
});
