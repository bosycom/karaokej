import { useSortable } from '@dnd-kit/sortable';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { FiMenu, FiX } from 'react-icons/fi';
import { QueueItemDto } from '@karaokej/shared';
import { api } from '../api';
import { queueDragId } from '../dnd/dragIds';
import { trackLabel } from '../session/SessionProvider';

interface QueueListProps {
  items: QueueItemDto[];
  currentQueueItemId: number | null;
}

export function QueueList({ items, currentQueueItemId }: QueueListProps) {
  return (
    <SortableContext
      items={items.map((item) => queueDragId(item.id))}
      strategy={verticalListSortingStrategy}
    >
      <ol className="queue-list">
        {items.map((item) => (
          <SortableQueueItem
            key={item.id}
            item={item}
            current={item.id === currentQueueItemId}
          />
        ))}
      </ol>
    </SortableContext>
  );
}

function SortableQueueItem({ item, current }: { item: QueueItemDto; current: boolean }) {
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
      className={`${current ? 'current' : ''}${isDragging ? ' dragging' : ''}`.trim()}
    >
      <button
        type="button"
        className="queue-handle"
        title="Drag to reorder"
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        <FiMenu aria-hidden />
      </button>
      <button type="button" className="queue-title" onClick={() => void api.playItem(item.id)}>
        {trackLabel(item.track)}
      </button>
      <div className="queue-actions">
        <button
          type="button"
          className="icon-btn"
          onClick={() => void api.removeFromQueue(item.id)}
          title="Remove"
          aria-label="Remove"
        >
          <FiX aria-hidden />
        </button>
      </div>
    </li>
  );
}
