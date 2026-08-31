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
}

export function QueueList({
  items,
  currentQueueItemId,
  dropLine = null,
  onShowCover,
  onApplySearchTerm,
}: QueueListProps) {
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
            dropLineClassName={dropLineClass(
              item.id,
              index === items.length - 1,
              dropLine,
              'queue',
            )}
            onShowCover={onShowCover}
            onApplySearchTerm={onApplySearchTerm}
          />
        ))}
      </ol>
    </SortableContext>
  );
}

function SortableQueueItem({
  item,
  current,
  dropLineClassName,
  onShowCover,
  onApplySearchTerm,
}: {
  item: QueueItemDto;
  current: boolean;
  dropLineClassName: string;
  onShowCover?: (track: QueueItemDto['track']) => void;
  onApplySearchTerm?: (term: string) => void;
}) {
  const { state } = useSession();
  const separation = queueSeparationDisplay(item, state.jobs.separation);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: queueDragId(item.id),
    data: { kind: 'queue', item },
  });

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={`${current ? 'current' : ''}${isDragging ? ' dragging' : ''}${dropLineClassName ? ` ${dropLineClassName}` : ''}`.trim()}
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
