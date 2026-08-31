import {
  closestCenter,
  pointerWithin,
  type Collision,
  type CollisionDetection,
} from '@dnd-kit/core';
import {
  isPlaylistDropTarget,
  isPlaylistItemTarget,
  isQueueDropTarget,
  parseDragId,
  QUEUE_DROPPABLE,
} from './dragIds';

function playlistAcceptFromHits(hits: Collision[]): Collision[] {
  const itemHit = hits.find((collision) => isPlaylistItemTarget(collision.id));
  if (itemHit) {
    return [itemHit];
  }
  const playlistHit = hits.find((collision) => isPlaylistDropTarget(collision.id));
  return playlistHit ? [playlistHit] : [];
}

function queueAcceptFromHits(hits: Collision[]): Collision[] {
  const overItem = hits.find((collision) => parseDragId(collision.id)?.kind === 'queue');
  if (overItem) {
    return [overItem];
  }
  const overPane = hits.find((collision) => collision.id === QUEUE_DROPPABLE);
  return overPane ? [overPane] : [];
}

function queueReorderCollisions(args: Parameters<CollisionDetection>[0]): Collision[] {
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

function playlistReorderCollisions(args: Parameters<CollisionDetection>[0]): Collision[] {
  const playlistItems = args.droppableContainers.filter(
    (container) => parseDragId(container.id)?.kind === 'playlist-item',
  );
  const overItem = pointerWithin({ ...args, droppableContainers: playlistItems });
  if (overItem.length > 0) {
    return overItem;
  }
  return closestCenter({ ...args, droppableContainers: playlistItems });
}

export const workspaceCollision: CollisionDetection = (args) => {
  const kind = parseDragId(args.active.id)?.kind;
  const hits = pointerWithin(args);

  if (kind === 'track') {
    const playlistHits = playlistAcceptFromHits(hits);
    if (playlistHits.length > 0) {
      return playlistHits;
    }
    return queueAcceptFromHits(hits.filter((collision) => isQueueDropTarget(collision.id)));
  }

  if (kind === 'queue') {
    const playlistHits = playlistAcceptFromHits(hits);
    if (playlistHits.length > 0) {
      return playlistHits;
    }
    return queueReorderCollisions(args);
  }

  if (kind === 'playlist-item') {
    const queueHits = queueAcceptFromHits(
      hits.filter((collision) => isQueueDropTarget(collision.id)),
    );
    if (queueHits.length > 0) {
      return queueHits;
    }
    return playlistReorderCollisions(args);
  }

  return hits;
};
