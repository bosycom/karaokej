import type { DragEndEvent, DragOverEvent } from '@dnd-kit/core';
import { parseDragId } from './dragIds';

export type DropLine = {
  list: 'queue' | 'playlist';
  beforeId: number | null;
};

export function pointerInsertsBefore(
  overTop: number,
  overHeight: number,
  pointerY: number,
): boolean {
  return pointerY < overTop + overHeight / 2;
}

export function beforeIdAfterHover(
  hoveredId: number,
  insertBefore: boolean,
  orderedIds: number[],
): number | null {
  if (insertBefore) {
    return hoveredId;
  }
  const index = orderedIds.indexOf(hoveredId);
  if (index < 0) {
    return null;
  }
  return orderedIds[index + 1] ?? null;
}

export function pointerYFromDrag(
  event: DragOverEvent | DragEndEvent,
): number | null {
  const translated = event.active.rect.current.translated;
  if (translated) {
    return translated.top + translated.height / 2;
  }
  if (event.over) {
    return event.over.rect.top + event.over.rect.height / 2;
  }
  return null;
}

export function dropLineClass(
  itemId: number,
  isLast: boolean,
  dropLine: DropLine | null,
  list: DropLine['list'],
): string {
  if (!dropLine || dropLine.list !== list) {
    return '';
  }
  if (dropLine.beforeId === itemId) {
    return 'drop-line-before';
  }
  if (dropLine.beforeId == null && isLast) {
    return 'drop-line-after';
  }
  return '';
}

export function resolveCrossListDropLine(
  overId: string | number,
  insertBefore: boolean,
  queueIds: number[],
  playlistItemIds: number[],
): DropLine | null {
  const parsed = parseDragId(overId);
  if (parsed?.kind === 'queue') {
    return {
      list: 'queue',
      beforeId: beforeIdAfterHover(parsed.id, insertBefore, queueIds),
    };
  }
  if (parsed?.kind === 'drop') {
    return { list: 'queue', beforeId: null };
  }
  if (parsed?.kind === 'playlist-item') {
    return {
      list: 'playlist',
      beforeId: beforeIdAfterHover(parsed.id, insertBefore, playlistItemIds),
    };
  }
  if (parsed?.kind === 'playlist') {
    return { list: 'playlist', beforeId: null };
  }
  return null;
}
