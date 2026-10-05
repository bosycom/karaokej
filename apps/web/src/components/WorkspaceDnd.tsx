import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
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
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { FiRepeat, FiShuffle, FiTrash2 } from 'react-icons/fi';
import { PlaylistDetailDto, PlaylistItemDto, PlaylistSummaryDto, QueueItemDto, TrackDto } from '@karaokej/shared';
import { api } from '../api';
import {
  isQueueDropTarget,
  parseDragId,
  playlistIdForAccept,
  QUEUE_DROPPABLE,
} from '../dnd/dragIds';
import {
  pointerInsertsBefore,
  pointerYFromDrag,
  resolveCrossListDropLine,
  type DropLine,
} from '../dnd/dropInsert';
import { workspaceCollision } from '../dnd/workspaceCollision';
import { formatAccumulatedDuration, formatDuration, formatTrackSubtitle } from '../format';
import {
  combineDurationTotals,
  queueCurrentLeftoverMs,
  queueUpcomingDurations,
  sumQueueItemDurations,
} from '../duration/listDuration';
import { useSession } from '../session/SessionProvider';
import { PlaylistPane } from './PlaylistPane';
import { QueueList } from './QueueList';
import { TrackMain } from './TrackMain';
import {
  PaneAccordionTrigger,
  paneAccordionClass,
  useWorkspaceAccordion,
  WorkspaceAccordionProvider,
} from './WorkspaceAccordion';

interface WorkspaceDndProps {
  tracks: TrackDto[];
  queue: QueueItemDto[];
  currentQueueItemId: number | null;
  library:
    | ReactNode
    | ((ctx: { activeTrackDragIds: number[] | null }) => ReactNode);
  playlistSummaries: PlaylistSummaryDto[];
  selectedPlaylistId: number | null;
  playlistDetail: PlaylistDetailDto | null;
  onSelectPlaylist: (id: number) => void;
  onCreatePlaylist: (name: string) => void;
  onRenamePlaylist: (id: number, name: string) => void;
  onDeletePlaylist: (id: number) => void;
  onRemovePlaylistItem: (itemId: number) => void;
  onPlayPlaylist: (id: number) => void;
  onPlayTrack: (track: TrackDto) => void;
  onClearQueue: () => void;
  onShuffleQueue: () => void;
  onToggleLoopQueue: (enabled: boolean) => void;
  loopQueue: boolean;
  onExplorerBatchDrop?: () => void;
  onPlaylistChanged: (detail: PlaylistDetailDto) => void;
  onPlaylistsRefresh: () => void;
  onShowCover?: (track: TrackDto) => void;
  onApplySearchTerm?: (term: string) => void;
  onManageTags?: (track: TrackDto) => void;
  revealQueueItemId?: number | null;
  onRevealQueueItem?: () => void;
}

type ActiveDrag =
  | { kind: 'track'; track: TrackDto; trackIds: number[] }
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
  onPlayTrack,
  onClearQueue,
  onShuffleQueue,
  onToggleLoopQueue,
  loopQueue,
  onExplorerBatchDrop,
  onPlaylistChanged,
  onPlaylistsRefresh,
  onShowCover,
  onApplySearchTerm,
  onManageTags,
  revealQueueItemId = null,
  onRevealQueueItem,
}: WorkspaceDndProps) {
  const [items, setItems] = useState(queue);
  const [playlistItems, setPlaylistItems] = useState(playlistDetail?.items ?? []);
  const [active, setActive] = useState<ActiveDrag | null>(null);
  const [dropActive, setDropActive] = useState(false);
  const [dropActivePlaylistId, setDropActivePlaylistId] = useState<number | null>(null);
  const [dropLine, setDropLine] = useState<DropLine | null>(null);
  const dropLineRef = useRef<DropLine | null>(null);
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
      const payload = event.active.data.current as { trackIds?: number[] } | undefined;
      const trackIds =
        payload?.trackIds && payload.trackIds.length > 0
          ? payload.trackIds
          : track
            ? [track.id]
            : [];
      if (track) {
        setActive({ kind: 'track', track, trackIds });
      }
    }
  };

  const setLine = (next: DropLine | null) => {
    dropLineRef.current = next;
    setDropLine(next);
  };

  const onDragOver = (event: DragOverEvent) => {
    const kind = parseDragId(event.active.id)?.kind;
    const sameListReorder =
      (kind === 'queue' && parseDragId(event.over?.id ?? '')?.kind === 'queue') ||
      (kind === 'playlist-item' &&
        parseDragId(event.over?.id ?? '')?.kind === 'playlist-item');
    const canDropOnPlaylist = kind === 'track' || kind === 'queue';
    const canDropOnQueue = kind === 'track' || kind === 'playlist-item';
    if (!event.over || sameListReorder) {
      setDropActive(false);
      setDropActivePlaylistId(null);
      setLine(null);
      return;
    }
    const pointerY = pointerYFromDrag(event);
    const insertBefore =
      pointerY != null
        ? pointerInsertsBefore(event.over.rect.top, event.over.rect.height, pointerY)
        : false;
    const nextLine = resolveCrossListDropLine(
      event.over.id,
      insertBefore,
      items.map((item) => item.id),
      playlistItems.map((item) => item.id),
    );

    if (canDropOnPlaylist) {
      const playlistId = playlistIdForAccept(event.over.id, selectedPlaylistId);
      if (playlistId != null) {
        const overKind = parseDragId(event.over.id)?.kind;
        setDropActive(false);
        setDropActivePlaylistId(overKind === 'playlist-item' ? null : playlistId);
        const showItemLine =
          overKind === 'playlist-item' ||
          (overKind === 'playlist' && playlistId === selectedPlaylistId);
        setLine(showItemLine && nextLine?.list === 'playlist' ? nextLine : null);
        return;
      }
    }
    if (canDropOnQueue && isQueueDropTarget(event.over.id)) {
      const overItem = parseDragId(event.over.id)?.kind === 'queue';
      setDropActive(!overItem);
      setDropActivePlaylistId(null);
      setLine(nextLine?.list === 'queue' ? nextLine : null);
      return;
    }
    setDropActive(false);
    setDropActivePlaylistId(null);
    setLine(null);
  };

  const finishDrag = () => {
    dragging.current = false;
    draggingPlaylist.current = false;
    setActive(null);
    setDropActive(false);
    setDropActivePlaylistId(null);
    setLine(null);
  };

  const onDragEnd = (event: DragEndEvent) => {
    const { active: dragged, over } = event;
    const from = parseDragId(dragged.id);
    const to = over ? parseDragId(over.id) : null;
    const insertLine = dropLineRef.current;
    finishDrag();

    if (!from || !to) {
      return;
    }

    const draggedTrackIds =
      from.kind === 'track'
        ? ((event.active.data.current as { trackIds?: number[] } | undefined)?.trackIds ??
          [from.id])
        : [];

    if (from.kind === 'track') {
      const playlistId = over ? playlistIdForAccept(over.id, selectedPlaylistId) : null;
      if (playlistId != null) {
        const beforeItemId =
          insertLine?.list === 'playlist' ? insertLine.beforeId : null;
        const add =
          draggedTrackIds.length > 1
            ? api.addTracksToPlaylist(playlistId, draggedTrackIds, beforeItemId)
            : api.addToPlaylist(playlistId, from.id, beforeItemId);
        void add.then((detail) => {
          if (selectedPlaylistId === playlistId) {
            onPlaylistChanged(detail);
          }
          onPlaylistsRefresh();
          if (draggedTrackIds.length > 1) {
            onExplorerBatchDrop?.();
          }
        });
        return;
      }
    }

    if (from.kind === 'track' && (to.kind === 'queue' || to.kind === 'drop')) {
      const beforeId = insertLine?.list === 'queue' ? insertLine.beforeId : null;
      const add =
        draggedTrackIds.length > 1
          ? api.addTracksToQueue(draggedTrackIds, 'end', beforeId)
          : api.addToQueue(from.id, 'end', beforeId);
      void add.then(() => {
        if (draggedTrackIds.length > 1) {
          onExplorerBatchDrop?.();
        }
      });
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
      return;
    }

    if (from.kind === 'playlist-item' && (to.kind === 'queue' || to.kind === 'drop')) {
      const item =
        playlistItems.find((entry) => entry.id === from.id) ??
        serverPlaylistItemsRef.current.find((entry) => entry.id === from.id);
      if (item?.available) {
        const beforeId = insertLine?.list === 'queue' ? insertLine.beforeId : null;
        void api.addToQueue(item.track.id, 'end', beforeId);
      }
      return;
    }

    if (from.kind === 'queue' && over) {
      const playlistId = playlistIdForAccept(over.id, selectedPlaylistId);
      if (!playlistId) {
        return;
      }
      const item =
        items.find((entry) => entry.id === from.id) ??
        serverQueueRef.current.find((entry) => entry.id === from.id);
      if (!item) {
        return;
      }
      const beforeItemId =
        insertLine?.list === 'playlist' ? insertLine.beforeId : null;
      void api.addToPlaylist(playlistId, item.track.id, beforeItemId).then((detail) => {
        if (selectedPlaylistId === playlistId) {
          onPlaylistChanged(detail);
        }
        onPlaylistsRefresh();
      });
    }
  };

  const detailForPane =
    playlistDetail && selectedPlaylistId === playlistDetail.id
      ? { ...playlistDetail, items: playlistItems }
      : playlistDetail;

  const { state, liveAudioDurationMs } = useSession();
  const durationByTrackId = useMemo(() => {
    const map = new Map<number, number>();
    for (const item of queue) {
      if (item.track.durationMs != null && item.track.durationMs > 0) {
        map.set(item.track.id, item.track.durationMs);
      }
    }
    const current = state.playback.currentTrack;
    if (current != null) {
      const resolved = Math.max(current.durationMs ?? 0, liveAudioDurationMs);
      if (resolved > 0) {
        map.set(current.id, resolved);
      }
    }
    return map;
  }, [queue, state.playback.currentTrack, liveAudioDurationMs]);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={workspaceCollision}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={finishDrag}
    >
      <WorkspaceAccordionProvider>
        <div className="workspace workspace-three">
          {typeof library === 'function'
            ? library({
                activeTrackDragIds:
                  active?.kind === 'track' ? active.trackIds : null,
              })
            : library}
          <PlaylistPane
            summaries={playlistSummaries}
            selectedId={selectedPlaylistId}
            detail={detailForPane}
            dropActivePlaylistId={dropActivePlaylistId}
            dropLine={dropLine?.list === 'playlist' ? dropLine : null}
            onSelect={onSelectPlaylist}
            onCreate={onCreatePlaylist}
            onRename={onRenamePlaylist}
            onDelete={onDeletePlaylist}
            onRemoveItem={onRemovePlaylistItem}
            onPlay={onPlayPlaylist}
            onPlayTrack={onPlayTrack}
            onShowCover={onShowCover}
            onApplySearchTerm={onApplySearchTerm}
            onManageTags={onManageTags}
            durationByTrackId={durationByTrackId}
          />
          <QueuePane
            items={items}
            currentQueueItemId={currentQueueItemId}
            durationByTrackId={durationByTrackId}
            dropActive={dropActive}
            dropLine={dropLine?.list === 'queue' ? dropLine : null}
            onClearQueue={onClearQueue}
            onShuffleQueue={onShuffleQueue}
            loopQueue={loopQueue}
            onToggleLoopQueue={onToggleLoopQueue}
            onShowCover={onShowCover}
            onApplySearchTerm={onApplySearchTerm}
            onManageTags={onManageTags}
            revealQueueItemId={revealQueueItemId}
            onRevealQueueItem={onRevealQueueItem}
          />
        </div>
      </WorkspaceAccordionProvider>
      <DragOverlay>
        {active?.kind === 'queue' ? (
          <div className={`queue-overlay${active.item.id === currentQueueItemId ? ' current' : ''}`}>
            <TrackMain track={active.item.track} />
          </div>
        ) : null}
        {active?.kind === 'playlist-item' ? (
          <div className={`queue-overlay${active.item.available ? '' : ' unavailable'}`}>
            <TrackMain track={active.item.track} muted={!active.item.available} />
          </div>
        ) : null}
        {active?.kind === 'track' ? (
          <div className="track-overlay">
            <strong>
              {active.trackIds.length > 1
                ? `${active.trackIds.length} songs`
                : active.track.title}
            </strong>
            <span>
              {active.trackIds.length > 1
                ? `Starting with ${active.track.title}`
                : formatTrackSubtitle(active.track)}
              {active.trackIds.length === 1 && active.track.durationMs != null
                ? ` · ${formatDuration(active.track.durationMs)}`
                : ''}
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
  durationByTrackId,
  dropActive,
  dropLine,
  onClearQueue,
  onShuffleQueue,
  loopQueue,
  onToggleLoopQueue,
  onShowCover,
  onApplySearchTerm,
  onManageTags,
  revealQueueItemId,
  onRevealQueueItem,
}: {
  items: QueueItemDto[];
  currentQueueItemId: number | null;
  durationByTrackId: ReadonlyMap<number, number>;
  dropActive: boolean;
  dropLine: DropLine | null;
  onClearQueue: () => void;
  onShuffleQueue: () => void;
  onShowCover?: (track: TrackDto) => void;
  onApplySearchTerm?: (term: string) => void;
  onManageTags?: (track: TrackDto) => void;
  revealQueueItemId?: number | null;
  onRevealQueueItem?: () => void;
  loopQueue: boolean;
  onToggleLoopQueue: (enabled: boolean) => void;
}) {
  const { setNodeRef } = useDroppable({ id: QUEUE_DROPPABLE });
  const { positionMs, liveAudioDurationMs } = useSession();
  const accordion = useWorkspaceAccordion();
  const shuffleEnabled = canShuffleQueue(items, currentQueueItemId);
  const shuffleLabel = currentQueueItemId
    ? 'Shuffle upcoming songs'
    : 'Shuffle queue';

  const totalDuration = useMemo(
    () => sumQueueItemDurations(items, durationByTrackId),
    [items, durationByTrackId],
  );
  const upcomingDuration = useMemo(
    () => queueUpcomingDurations(items, currentQueueItemId, durationByTrackId),
    [items, currentQueueItemId, durationByTrackId],
  );

  const currentItem =
    currentQueueItemId == null
      ? null
      : (items.find((item) => item.id === currentQueueItemId) ?? null);
  const currentDurationMs =
    currentItem == null
      ? 0
      : Math.max(
          durationByTrackId.get(currentItem.track.id) ??
            currentItem.track.durationMs ??
            0,
          liveAudioDurationMs,
        );
  const currentLeftover =
    currentItem == null
      ? { totalMs: 0, unknownCount: 0 }
      : currentDurationMs > 0
        ? {
            totalMs: queueCurrentLeftoverMs(currentDurationMs, positionMs),
            unknownCount: 0,
          }
        : { totalMs: 0, unknownCount: 1 };
  const remainingDuration = combineDurationTotals(currentLeftover, upcomingDuration);

  const totalLabel =
    items.length > 0 ? formatAccumulatedDuration(totalDuration) : null;
  const remainingLabel =
    currentQueueItemId != null && items.length > 0
      ? formatAccumulatedDuration(remainingDuration)
      : null;

  return (
    <aside
      ref={setNodeRef}
      className={`queue-pane${dropActive ? ' drop-active' : ''}${paneAccordionClass('queue', accordion)}`}
    >
      <div className="queue-pane-toolbar">
        <PaneAccordionTrigger pane="queue">
          <h2>
            Queue
            <span className="queue-count">{items.length}</span>
            {totalLabel && <span className="queue-duration">{totalLabel}</span>}
            {remainingLabel && (
              <span className="queue-duration queue-duration-remaining">
                {remainingLabel} left
              </span>
            )}
          </h2>
        </PaneAccordionTrigger>
        <div className="queue-pane-toolbar-actions">
          <button
            type="button"
            className="icon-btn"
            title={loopQueue ? 'Loop queue on' : 'Loop queue off'}
            aria-label={loopQueue ? 'Loop queue on' : 'Loop queue off'}
            aria-pressed={loopQueue}
            onClick={() => onToggleLoopQueue(!loopQueue)}
          >
            <FiRepeat aria-hidden />
          </button>
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
      <div className="queue-items-scroll">
        {items.length === 0 ? (
          <p className="empty">
            {dropActive ? 'Drop to add to the queue' : 'Queue is empty. Add a song from the library or a playlist.'}
          </p>
        ) : (
          <QueueList
            items={items}
            currentQueueItemId={currentQueueItemId}
            dropLine={dropLine}
            onShowCover={onShowCover}
            onApplySearchTerm={onApplySearchTerm}
            onManageTags={onManageTags}
            revealQueueItemId={revealQueueItemId}
            onRevealQueueItem={onRevealQueueItem}
          />
        )}
      </div>
    </aside>
  );
}
