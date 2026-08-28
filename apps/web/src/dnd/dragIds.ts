export const QUEUE_DROPPABLE = 'queue-drop';

export function trackDragId(trackId: number): string {
  return `track:${trackId}`;
}

export function queueDragId(queueItemId: number): string {
  return `queue:${queueItemId}`;
}

export type ParsedDragId =
  | { kind: 'track'; id: number }
  | { kind: 'queue'; id: number }
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
  return null;
}

export function isQueueDropTarget(id: string | number): boolean {
  const parsed = parseDragId(id);
  return parsed?.kind === 'queue' || parsed?.kind === 'drop';
}
