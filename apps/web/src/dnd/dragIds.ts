export const QUEUE_DROPPABLE = 'queue-drop';

export function trackDragId(trackId: number): string {
  return `track:${trackId}`;
}

export function queueDragId(queueItemId: number): string {
  return `queue:${queueItemId}`;
}

export function playlistDropId(playlistId: number): string {
  return `playlist:${playlistId}`;
}

export function playlistItemDragId(itemId: number): string {
  return `playlist-item:${itemId}`;
}

export type ParsedDragId =
  | { kind: 'track'; id: number }
  | { kind: 'queue'; id: number }
  | { kind: 'playlist'; id: number }
  | { kind: 'playlist-item'; id: number }
  | { kind: 'drop' };

export function parseDragId(id: string | number): ParsedDragId | null {
  const value = String(id);
  if (value === QUEUE_DROPPABLE) {
    return { kind: 'drop' };
  }
  if (value.startsWith('track:')) {
    return { kind: 'track', id: Number(value.slice(6)) };
  }
  if (value.startsWith('queue:')) {
    return { kind: 'queue', id: Number(value.slice(6)) };
  }
  if (value.startsWith('playlist-item:')) {
    return { kind: 'playlist-item', id: Number(value.slice(14)) };
  }
  if (value.startsWith('playlist:')) {
    return { kind: 'playlist', id: Number(value.slice(9)) };
  }
  return null;
}

export function isQueueDropTarget(id: string | number): boolean {
  const parsed = parseDragId(id);
  return parsed?.kind === 'queue' || parsed?.kind === 'drop';
}

export function isPlaylistDropTarget(id: string | number): boolean {
  return parseDragId(id)?.kind === 'playlist';
}
