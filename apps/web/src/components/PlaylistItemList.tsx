import { useSortable, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { FiX } from 'react-icons/fi';
import { PlaylistItemDto } from '@karaokej/shared';
import { playlistItemDragId } from '../dnd/dragIds';
import { dropLineClass, type DropLine } from '../dnd/dropInsert';
import { formatDuration } from '../format';
import { CoverArt } from './CoverArt';

interface PlaylistItemListProps {
  items: PlaylistItemDto[];
  onRemove: (itemId: number) => void;
  dropLine?: DropLine | null;
  onShowCover?: (track: PlaylistItemDto['track']) => void;
}

export function PlaylistItemList({
  items,
  onRemove,
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
  dropLineClassName,
  onShowCover,
}: {
  item: PlaylistItemDto;
  onRemove: (itemId: number) => void;
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
      <CoverArt
        track={item.track}
        size={32}
        onClick={onShowCover ? () => onShowCover(item.track) : undefined}
      />
      <div className="playlist-item-main">
        <strong>{item.track.title}</strong>
        <span>
          {item.track.artist ?? 'Unknown artist'}
          {item.track.album ? ` · ${item.track.album}` : ''}
        </span>
      </div>
      <div className="track-meta">
        {!item.available && <span className="badge warn">Missing</span>}
        <span className="time">{formatDuration(item.track.durationMs)}</span>
        <button
          type="button"
          className="icon-btn"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => onRemove(item.id)}
          title="Remove from playlist"
          aria-label="Remove from playlist"
        >
          <FiX aria-hidden />
        </button>
      </div>
    </li>
  );
}
