import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { QueueItemDto } from '@karaokej/shared';
import { api } from '../api';
import { queueDragId } from '../dnd/dragIds';
import { dropLineClass, type DropLine } from '../dnd/dropInsert';
import { queueSeparationDisplay } from '../queue/queueSeparationDisplay';
import { useSession } from '../session/SessionProvider';
import { CircularProgress } from './CircularProgress';
import { isInteractiveTrackTarget } from './TrackMain';
import { WorkspaceTrackRow } from './WorkspaceTrackRow';

interface QueueListProps {
  items: QueueItemDto[];
  currentQueueItemId: number | null;
  dropLine?: DropLine | null;
  onShowCover?: (track: QueueItemDto['track']) => void;
  onApplySearchTerm?: (term: string) => void;
  onManageTags?: (track: QueueItemDto['track']) => void;
  revealQueueItemId?: number | null;
  onRevealQueueItem?: () => void;
}

export function QueueList({
  items,
  currentQueueItemId,
  dropLine = null,
  onShowCover,
  onApplySearchTerm,
  onManageTags,
  revealQueueItemId = null,
  onRevealQueueItem,
}: QueueListProps) {
  const itemRefs = useRef(new Map<number, HTMLLIElement>());
  const [flashItemId, setFlashItemId] = useState<number | null>(null);

  useEffect(() => {
    if (revealQueueItemId == null) {
      return;
    }
    if (!items.some((item) => item.id === revealQueueItemId)) {
      return;
    }
    const node = itemRefs.current.get(revealQueueItemId);
    if (!node) {
      return;
    }
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    node.scrollIntoView({
      block: 'nearest',
      behavior: reduceMotion ? 'auto' : 'smooth',
    });
    setFlashItemId(revealQueueItemId);
    onRevealQueueItem?.();
  }, [revealQueueItemId, items, onRevealQueueItem]);

  useEffect(() => {
    if (flashItemId == null) {
      return;
    }
    const timeout = window.setTimeout(() => setFlashItemId(null), 1400);
    return () => window.clearTimeout(timeout);
  }, [flashItemId]);

  return (
    <SortableContext
      items={items.map((item) => queueDragId(item.id))}
      strategy={verticalListSortingStrategy}
    >
      <ol className="queue-list">
        {items.map((item, index) => (
          <SortableQueueItem
            key={item.id}
            item={item}
            current={item.id === currentQueueItemId}
            flash={item.id === flashItemId}
            dropLineClassName={dropLineClass(
              item.id,
              index === items.length - 1,
              dropLine,
              'queue',
            )}
            onShowCover={onShowCover}
            onApplySearchTerm={onApplySearchTerm}
            onManageTags={onManageTags}
            itemRefs={itemRefs}
          />
        ))}
      </ol>
    </SortableContext>
  );
}

function SortableQueueItem({
  item,
  current,
  flash,
  dropLineClassName,
  onShowCover,
  onApplySearchTerm,
  onManageTags,
  itemRefs,
}: {
  item: QueueItemDto;
  current: boolean;
  flash: boolean;
  dropLineClassName: string;
  onShowCover?: (track: QueueItemDto['track']) => void;
  onApplySearchTerm?: (term: string) => void;
  onManageTags?: (track: QueueItemDto['track']) => void;
  itemRefs: MutableRefObject<Map<number, HTMLLIElement>>;
}) {
  const { state } = useSession();
  const separation = queueSeparationDisplay(item, state.jobs.separation);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: queueDragId(item.id),
    data: { kind: 'queue', item },
  });

  return (
    <li
      ref={(node) => {
        setNodeRef(node);
        const refs = itemRefs.current;
        if (!refs) {
          return;
        }
        if (node) {
          refs.set(item.id, node);
        } else {
          refs.delete(item.id);
        }
      }}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={`${current ? 'current' : ''}${isDragging ? ' dragging' : ''}${flash ? ' reveal' : ''}${dropLineClassName ? ` ${dropLineClassName}` : ''}`.trim()}
      title="Drag to reorder or add to a playlist"
      onDoubleClick={(event) => {
        if (isInteractiveTrackTarget(event.target)) {
          return;
        }
        void api.playItem(item.id);
      }}
      {...attributes}
      {...listeners}
    >
      <WorkspaceTrackRow
        track={item.track}
        onPlay={() => void api.playItem(item.id)}
        onRemove={() => void api.removeFromQueue(item.id)}
        onShowCover={onShowCover}
        onApplySearchTerm={onApplySearchTerm}
        onManageTags={onManageTags}
        extras={
          <>
            {separation.kind === 'progress' && (
              <CircularProgress percent={separation.percent} />
            )}
            {separation.kind === 'queued' && (
              <CircularProgress percent={0} indeterminate title="Queued for AI separation" />
            )}
          </>
        }
      />
    </li>
  );
}
