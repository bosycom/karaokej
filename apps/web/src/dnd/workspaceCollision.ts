import {
  closestCenter,
  pointerWithin,
  type CollisionDetection,
} from '@dnd-kit/core';
import {
  isPlaylistDropTarget,
  isQueueDropTarget,
  parseDragId,
  QUEUE_DROPPABLE,
} from './dragIds';

export const workspaceCollision: CollisionDetection = (args) => {
  const kind = parseDragId(args.active.id)?.kind;

  if (kind === 'track') {
    const hits = pointerWithin(args);
    const playlistHit = hits.find((collision) => isPlaylistDropTarget(collision.id));
    if (playlistHit) {
      return [playlistHit];
    }
    const queueHits = hits.filter((collision) => isQueueDropTarget(collision.id));
    const overItem = queueHits.find((collision) => parseDragId(collision.id)?.kind === 'queue');
    if (overItem) {
      return [overItem];
    }
    const overPane = queueHits.find((collision) => collision.id === QUEUE_DROPPABLE);
    return overPane ? [overPane] : [];
  }

  if (kind === 'queue') {
    const queueItems = args.droppableContainers.filter(
      (container) => parseDragId(container.id)?.kind === 'queue',
    );
    const overItem = pointerWithin({ ...args, droppableContainers: queueItems });
    if (overItem.length > 0) {
      return overItem;
    }
    const overPane = pointerWithin({
      ...args,
      droppableContainers: args.droppableContainers.filter(
        (container) => container.id === QUEUE_DROPPABLE,
      ),
    });
    if (overPane.length > 0) {
      return closestCenter({ ...args, droppableContainers: queueItems });
    }
    return [];
  }

  if (kind === 'playlist-item') {
    const playlistItems = args.droppableContainers.filter(
      (container) => parseDragId(container.id)?.kind === 'playlist-item',
    );
    const overItem = pointerWithin({ ...args, droppableContainers: playlistItems });
    if (overItem.length > 0) {
      return overItem;
    }
    return closestCenter({ ...args, droppableContainers: playlistItems });
  }

  return pointerWithin(args);
};
