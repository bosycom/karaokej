import { ReactNode, useEffect, useRef, useState } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { FiMenu } from 'react-icons/fi';
import { QueueItemDto, TrackDto } from '@karaokej/shared';
import { api } from '../api';
import { isQueueDropTarget, parseDragId, QUEUE_DROPPABLE } from '../dnd/dragIds';
import { workspaceCollision } from '../dnd/workspaceCollision';
import { formatDuration } from '../format';
import { trackLabel } from '../session/SessionProvider';
import { QueueList } from './QueueList';

interface WorkspaceDndProps {
  tracks: TrackDto[];
  queue: QueueItemDto[];
  currentQueueItemId: number | null;
  library: ReactNode;
}

type ActiveDrag =
  | { kind: 'track'; track: TrackDto }
  | { kind: 'queue'; item: QueueItemDto };

export function WorkspaceDnd({
  tracks,
  queue,
  currentQueueItemId,
  library,
}: WorkspaceDndProps) {
  const [items, setItems] = useState(queue);
  const [active, setActive] = useState<ActiveDrag | null>(null);
  const [dropActive, setDropActive] = useState(false);
  const dragging = useRef(false);
  const serverQueueRef = useRef(queue);
  serverQueueRef.current = queue;

  useEffect(() => {
    if (!dragging.current) {
      setItems(queue);
    }
  }, [queue]);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragStart = (event: DragStartEvent) => {
    const parsed = parseDragId(event.active.id);
    if (parsed?.kind === 'queue') {
      dragging.current = true;
      const item = items.find((entry) => entry.id === parsed.id);
      if (item) {
        setActive({ kind: 'queue', item });
      }
      return;
    }
    if (parsed?.kind === 'track') {
      const track = tracks.find((entry) => entry.id === parsed.id);
      if (track) {
        setActive({ kind: 'track', track });
      }
    }
  };

  const onDragOver = (event: DragOverEvent) => {
    const draggingTrack = parseDragId(event.active.id)?.kind === 'track';
    setDropActive(Boolean(draggingTrack && event.over && isQueueDropTarget(event.over.id)));
  };

  const finishDrag = () => {
    dragging.current = false;
    setActive(null);
    setDropActive(false);
  };

  const onDragEnd = (event: DragEndEvent) => {
    const { active: dragged, over } = event;
    const from = parseDragId(dragged.id);
    const to = over ? parseDragId(over.id) : null;
    finishDrag();

    if (!from || !to) {
      return;
    }

    if (from.kind === 'track' && (to.kind === 'queue' || to.kind === 'drop')) {
      void api.addToQueue(from.id);
      return;
    }

    if (from.kind === 'queue' && to.kind === 'queue' && from.id !== to.id) {
      const oldIndex = items.findIndex((item) => item.id === from.id);
      const newIndex = items.findIndex((item) => item.id === to.id);
      if (oldIndex < 0 || newIndex < 0) {
        return;
      }
      const next = arrayMove(items, oldIndex, newIndex);
      setItems(next);
      dragging.current = true;
      void api.reorderQueue(next.map((item) => item.id)).catch(() => {
        setItems(serverQueueRef.current);
      }).finally(() => {
        dragging.current = false;
      });
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={workspaceCollision}
      modifiers={active?.kind === 'queue' ? [restrictToVerticalAxis] : undefined}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={finishDrag}
    >
      <div className="workspace">
        {library}
        <QueuePane
          items={items}
          currentQueueItemId={currentQueueItemId}
          dropActive={dropActive}
        />
      </div>
      <DragOverlay>
        {active?.kind === 'queue' ? (
          <div className={`queue-overlay${active.item.id === currentQueueItemId ? ' current' : ''}`}>
            <span className="queue-handle" aria-hidden>
              <FiMenu />
            </span>
            <span className="queue-title">{trackLabel(active.item.track)}</span>
          </div>
        ) : null}
        {active?.kind === 'track' ? (
          <div className="track-overlay">
            <strong>{active.track.title}</strong>
            <span>
              {active.track.artist ?? 'Unknown artist'}
              {active.track.album ? ` · ${active.track.album}` : ''}
              {active.track.durationMs != null ? ` · ${formatDuration(active.track.durationMs)}` : ''}
            </span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function QueuePane({
  items,
  currentQueueItemId,
  dropActive,
}: {
  items: QueueItemDto[];
  currentQueueItemId: number | null;
  dropActive: boolean;
}) {
  const { setNodeRef } = useDroppable({ id: QUEUE_DROPPABLE });

  return (
    <aside
      ref={setNodeRef}
      className={`queue-pane${dropActive ? ' drop-active' : ''}`}
    >
      <h2>Queue</h2>
      {items.length === 0 ? (
        <p className="empty">
          {dropActive ? 'Drop to add to the queue' : 'Queue is empty. Add a song from the library.'}
        </p>
      ) : (
        <QueueList items={items} currentQueueItemId={currentQueueItemId} />
      )}
    </aside>
  );
}
