import { useSortable, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { FiMenu, FiX } from 'react-icons/fi';
import { PlaylistItemDto } from '@karaokej/shared';
import { playlistItemDragId } from '../dnd/dragIds';
import { formatDuration } from '../format';

interface PlaylistItemListProps {
  items: PlaylistItemDto[];
  onRemove: (itemId: number) => void;
}

export function PlaylistItemList({ items, onRemove }: PlaylistItemListProps) {
  return (
    <SortableContext
      items={items.map((item) => playlistItemDragId(item.id))}
      strategy={verticalListSortingStrategy}
    >
      <ul className="queue-list playlist-item-list">
        {items.map((item) => (
          <SortablePlaylistItem key={item.id} item={item} onRemove={onRemove} />
        ))}
      </ul>
    </SortableContext>
  );
}

function SortablePlaylistItem({
  item,
  onRemove,
}: {
  item: PlaylistItemDto;
  onRemove: (itemId: number) => void;
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
      className={`${isDragging ? 'dragging' : ''}${item.available ? '' : ' unavailable'}`}
    >
      <button
        type="button"
        className="queue-handle"
        aria-label="Reorder playlist item"
        disabled={!item.available}
        {...attributes}
        {...listeners}
      >
        <FiMenu aria-hidden />
      </button>
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
