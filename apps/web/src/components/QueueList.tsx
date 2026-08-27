import { useEffect, useRef, useState } from 'react';
import {
  closestCenter,
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { FiMenu, FiX } from 'react-icons/fi';
import { QueueItemDto } from '@karaokej/shared';
import { api } from '../api';
import { trackLabel } from '../session/SessionProvider';

interface QueueListProps {
  items: QueueItemDto[];
  currentQueueItemId: number | null;
}

export function QueueList({ items: serverItems, currentQueueItemId }: QueueListProps) {
  const [items, setItems] = useState(serverItems);
  const [activeId, setActiveId] = useState<number | null>(null);
  const dragging = useRef(false);
  const serverItemsRef = useRef(serverItems);
  serverItemsRef.current = serverItems;

  useEffect(() => {
    if (!dragging.current) {
      setItems(serverItems);
    }
  }, [serverItems]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const activeItem = activeId != null ? items.find((item) => item.id === activeId) : undefined;

  const onDragStart = (event: DragStartEvent) => {
    dragging.current = true;
    setActiveId(Number(event.active.id));
  };

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    dragging.current = false;
    setActiveId(null);

    if (!over || active.id === over.id) {
      return;
    }

    const oldIndex = items.findIndex((item) => item.id === active.id);
    const newIndex = items.findIndex((item) => item.id === over.id);
    if (oldIndex < 0 || newIndex < 0) {
      return;
    }

    const next = arrayMove(items, oldIndex, newIndex);
    setItems(next);
    void api.reorderQueue(next.map((item) => item.id)).catch(() => {
      setItems(serverItemsRef.current);
    });
  };

  const onDragCancel = () => {
    dragging.current = false;
    setActiveId(null);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis]}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
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
      <DragOverlay>
        {activeItem ? (
          <div className={`queue-overlay${activeItem.id === currentQueueItemId ? ' current' : ''}`}>
            <span className="queue-handle" aria-hidden>
              <FiMenu />
            </span>
            <span className="queue-title">{trackLabel(activeItem.track)}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function SortableQueueItem({ item, current }: { item: QueueItemDto; current: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
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
