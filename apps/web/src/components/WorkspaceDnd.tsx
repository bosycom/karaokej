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
import { FiMenu, FiShuffle, FiTrash2 } from 'react-icons/fi';
import { PlaylistDetailDto, PlaylistItemDto, PlaylistSummaryDto, QueueItemDto, TrackDto } from '@karaokej/shared';
import { api } from '../api';
import {
  isPlaylistDropTarget,
  isQueueDropTarget,
  parseDragId,
  QUEUE_DROPPABLE,
} from '../dnd/dragIds';
import { workspaceCollision } from '../dnd/workspaceCollision';
import { formatDuration, formatTrackSubtitle } from '../format';
import { trackLabel } from '../session/SessionProvider';
import { PlaylistPane } from './PlaylistPane';
import { QueueList } from './QueueList';

interface WorkspaceDndProps {
  tracks: TrackDto[];
  queue: QueueItemDto[];
  currentQueueItemId: number | null;
  library: ReactNode;
  playlistSummaries: PlaylistSummaryDto[];
  selectedPlaylistId: number | null;
  playlistDetail: PlaylistDetailDto | null;
  onSelectPlaylist: (id: number) => void;
  onCreatePlaylist: (name: string) => void;
  onRenamePlaylist: (id: number, name: string) => void;
  onDeletePlaylist: (id: number) => void;
  onRemovePlaylistItem: (itemId: number) => void;
  onPlayPlaylist: (id: number) => void;
  onClearQueue: () => void;
  onShuffleQueue: () => void;
  onPlaylistChanged: (detail: PlaylistDetailDto) => void;
  onPlaylistsRefresh: () => void;
}

type ActiveDrag =
  | { kind: 'track'; track: TrackDto }
  | { kind: 'queue'; item: QueueItemDto }
  | { kind: 'playlist-item'; item: PlaylistItemDto };

export function WorkspaceDnd({
  tracks,
  queue,
  currentQueueItemId,
  library,
  playlistSummaries,
  selectedPlaylistId,
  playlistDetail,
  onSelectPlaylist,
  onCreatePlaylist,
  onRenamePlaylist,
  onDeletePlaylist,
  onRemovePlaylistItem,
  onPlayPlaylist,
  onClearQueue,
  onShuffleQueue,
  onPlaylistChanged,
  onPlaylistsRefresh,
}: WorkspaceDndProps) {
  const [items, setItems] = useState(queue);
  const [playlistItems, setPlaylistItems] = useState(playlistDetail?.items ?? []);
  const [active, setActive] = useState<ActiveDrag | null>(null);
  const [dropActive, setDropActive] = useState(false);
  const [dropActivePlaylistId, setDropActivePlaylistId] = useState<number | null>(null);
  const dragging = useRef(false);
  const draggingPlaylist = useRef(false);
  const serverQueueRef = useRef(queue);
  serverQueueRef.current = queue;
  const serverPlaylistItemsRef = useRef(playlistDetail?.items ?? []);
  serverPlaylistItemsRef.current = playlistDetail?.items ?? [];

  useEffect(() => {
    if (!dragging.current) {
      setItems(queue);
    }
  }, [queue]);

  useEffect(() => {
    if (!draggingPlaylist.current) {
      setPlaylistItems(playlistDetail?.items ?? []);
    }
  }, [playlistDetail]);

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
    if (parsed?.kind === 'playlist-item') {
      draggingPlaylist.current = true;
      const item = playlistItems.find((entry) => entry.id === parsed.id);
      if (item) {
        setActive({ kind: 'playlist-item', item });
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
    if (!draggingTrack || !event.over) {
      setDropActive(false);
      setDropActivePlaylistId(null);
      return;
    }
    if (isPlaylistDropTarget(event.over.id)) {
      const parsed = parseDragId(event.over.id);
      setDropActive(false);
      setDropActivePlaylistId(parsed?.kind === 'playlist' ? parsed.id : null);
      return;
    }
    setDropActive(Boolean(isQueueDropTarget(event.over.id)));
    setDropActivePlaylistId(null);
  };

  const finishDrag = () => {
    dragging.current = false;
    draggingPlaylist.current = false;
    setActive(null);
    setDropActive(false);
    setDropActivePlaylistId(null);
  };

  const onDragEnd = (event: DragEndEvent) => {
    const { active: dragged, over } = event;
    const from = parseDragId(dragged.id);
    const to = over ? parseDragId(over.id) : null;
    finishDrag();

    if (!from || !to) {
      return;
    }

    if (from.kind === 'track' && to.kind === 'playlist') {
      void api.addToPlaylist(to.id, from.id).then((detail) => {
        if (selectedPlaylistId === to.id) {
          onPlaylistChanged(detail);
        }
        onPlaylistsRefresh();
      });
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
      return;
    }

    if (
      from.kind === 'playlist-item' &&
      to.kind === 'playlist-item' &&
      from.id !== to.id &&
      selectedPlaylistId
    ) {
      const oldIndex = playlistItems.findIndex((item) => item.id === from.id);
      const newIndex = playlistItems.findIndex((item) => item.id === to.id);
      if (oldIndex < 0 || newIndex < 0) {
        return;
      }
      const next = arrayMove(playlistItems, oldIndex, newIndex);
      setPlaylistItems(next);
      draggingPlaylist.current = true;
      void api
        .reorderPlaylistItems(
          selectedPlaylistId,
          next.map((item) => item.id),
        )
        .then(onPlaylistChanged)
        .catch(() => {
          setPlaylistItems(serverPlaylistItemsRef.current);
        })
        .finally(() => {
          draggingPlaylist.current = false;
        });
    }
  };

  const detailForPane =
    playlistDetail && selectedPlaylistId === playlistDetail.id
      ? { ...playlistDetail, items: playlistItems }
      : playlistDetail;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={workspaceCollision}
      modifiers={
        active?.kind === 'queue' || active?.kind === 'playlist-item'
          ? [restrictToVerticalAxis]
          : undefined
      }
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={finishDrag}
    >
      <div className="workspace workspace-three">
        {library}
        <PlaylistPane
          summaries={playlistSummaries}
          selectedId={selectedPlaylistId}
          detail={detailForPane}
          dropActivePlaylistId={dropActivePlaylistId}
          onSelect={onSelectPlaylist}
          onCreate={onCreatePlaylist}
          onRename={onRenamePlaylist}
          onDelete={onDeletePlaylist}
          onRemoveItem={onRemovePlaylistItem}
          onPlay={onPlayPlaylist}
        />
        <QueuePane
          items={items}
          currentQueueItemId={currentQueueItemId}
          dropActive={dropActive}
          onClearQueue={onClearQueue}
          onShuffleQueue={onShuffleQueue}
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
        {active?.kind === 'playlist-item' ? (
          <div className={`queue-overlay${active.item.available ? '' : ' unavailable'}`}>
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
              {formatTrackSubtitle(active.track)}
              {active.track.durationMs != null ? ` · ${formatDuration(active.track.durationMs)}` : ''}
            </span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function canShuffleQueue(items: QueueItemDto[], currentQueueItemId: number | null): boolean {
  if (items.length < 2) {
    return false;
  }
  if (!currentQueueItemId) {
    return true;
  }
  const currentIndex = items.findIndex((item) => item.id === currentQueueItemId);
  if (currentIndex < 0) {
    return true;
  }
  return items.length - currentIndex - 1 >= 2;
}

function QueuePane({
  items,
  currentQueueItemId,
  dropActive,
  onClearQueue,
  onShuffleQueue,
}: {
  items: QueueItemDto[];
  currentQueueItemId: number | null;
  dropActive: boolean;
  onClearQueue: () => void;
  onShuffleQueue: () => void;
}) {
  const { setNodeRef } = useDroppable({ id: QUEUE_DROPPABLE });
  const shuffleEnabled = canShuffleQueue(items, currentQueueItemId);
  const shuffleLabel = currentQueueItemId
    ? 'Shuffle upcoming songs'
    : 'Shuffle queue';

  return (
    <aside
      ref={setNodeRef}
      className={`queue-pane${dropActive ? ' drop-active' : ''}`}
    >
      <div className="queue-pane-toolbar">
        <h2>Queue</h2>
        <div className="queue-pane-toolbar-actions">
          <button
            type="button"
            className="icon-btn"
            title={shuffleLabel}
            aria-label={shuffleLabel}
            disabled={!shuffleEnabled}
            onClick={onShuffleQueue}
          >
            <FiShuffle aria-hidden />
          </button>
          <button
            type="button"
            className="icon-btn"
            title="Empty queue"
            aria-label="Empty queue"
            disabled={items.length === 0}
            onClick={onClearQueue}
          >
            <FiTrash2 aria-hidden />
          </button>
        </div>
      </div>
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
