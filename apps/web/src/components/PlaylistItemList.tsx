import { useSortable, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { PlaylistItemDto, TrackDto } from '@karaokej/shared';
import { playlistItemDragId } from '../dnd/dragIds';
import { dropLineClass, type DropLine } from '../dnd/dropInsert';
import { WorkspaceTrackRow } from './WorkspaceTrackRow';

interface PlaylistItemListProps {
  items: PlaylistItemDto[];
  onRemove: (itemId: number) => void;
  onPlayTrack: (track: TrackDto) => void;
  dropLine?: DropLine | null;
  onShowCover?: (track: PlaylistItemDto['track']) => void;
}

export function PlaylistItemList({
  items,
  onRemove,
  onPlayTrack,
  dropLine = null,
  onShowCover,
}: PlaylistItemListProps) {
  return (
    <SortableContext
      items={items.map((item) => playlistItemDragId(item.id))}
      strategy={verticalListSortingStrategy}
    >
      <ul className="queue-list playlist-item-list">
        {items.map((item, index) => (
          <SortablePlaylistItem
            key={item.id}
            item={item}
            onRemove={onRemove}
            onPlayTrack={onPlayTrack}
            dropLineClassName={dropLineClass(
              item.id,
              index === items.length - 1,
              dropLine,
              'playlist',
            )}
            onShowCover={onShowCover}
          />
        ))}
      </ul>
    </SortableContext>
  );
}

function SortablePlaylistItem({
  item,
  onRemove,
  onPlayTrack,
  dropLineClassName,
  onShowCover,
}: {
  item: PlaylistItemDto;
  onRemove: (itemId: number) => void;
  onPlayTrack: (track: TrackDto) => void;
  dropLineClassName: string;
  onShowCover?: (track: PlaylistItemDto['track']) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: playlistItemDragId(item.id),
    data: { kind: 'playlist-item', item },
    disabled: !item.available,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`${isDragging ? 'dragging' : ''}${item.available ? '' : ' unavailable'}${dropLineClassName ? ` ${dropLineClassName}` : ''}`}
      title={item.available ? 'Drag to reorder or add to the queue' : undefined}
      {...(item.available ? { ...attributes, ...listeners } : {})}
    >
      <WorkspaceTrackRow
        track={item.track}
        onPlay={() => onPlayTrack(item.track)}
        playDisabled={!item.available}
        onRemove={() => onRemove(item.id)}
        removeTitle="Remove from playlist"
        removeAriaLabel="Remove from playlist"
        onShowCover={onShowCover}
        labelMuted={!item.available}
        extras={
          !item.available ? <span className="badge warn">Missing</span> : undefined
        }
      />
    </li>
  );
}
