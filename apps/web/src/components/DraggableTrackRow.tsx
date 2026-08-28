import { useDraggable } from '@dnd-kit/core';
import { FiList } from 'react-icons/fi';
import { TrackDto } from '@karaokej/shared';
import { api } from '../api';
import { trackDragId } from '../dnd/dragIds';
import { formatDuration, lyricBadge } from '../format';
import { ProcessingText } from './ProcessingText';
import { StarRating } from './StarRating';

interface DraggableTrackRowProps {
  track: TrackDto;
  fetching: boolean;
  onFetchLyrics: (trackId: number) => void;
  onRate: (trackId: number, rating: number) => void;
}

export function DraggableTrackRow({
  track,
  fetching,
  onFetchLyrics,
  onRate,
}: DraggableTrackRowProps) {
  const { listeners, setNodeRef, isDragging } = useDraggable({
    id: trackDragId(track.id),
    data: { kind: 'track', track },
  });
  const badge = lyricBadge(track.lyricStatus);
  const canFetch = track.lyricStatus !== 'present';
  const fetchLabel = fetching ? 'Fetching…' : 'Fetch lyric';

  return (
    <li ref={setNodeRef} className={isDragging ? 'dragging' : undefined}>
      <div className="track-main" title="Drag to add to queue" {...listeners}>
        <strong>{track.title}</strong>
        <span>
          {track.artist ?? 'Unknown artist'}
          {track.album ? ` · ${track.album}` : ''}
        </span>
      </div>
      <div className="track-meta">
        {canFetch ? (
          <button
            type="button"
            className={`badge ${badge.tone} badge-fetch`}
            disabled={fetching}
            onClick={() => onFetchLyrics(track.id)}
            title={fetchLabel}
            aria-label={fetchLabel}
          >
            <span className="badge-idle">
              {fetching ? <ProcessingText>Fetching…</ProcessingText> : badge.label}
            </span>
            {!fetching && <span className="badge-action">Fetch lyric</span>}
          </button>
        ) : (
          <span className={`badge ${badge.tone}`}>{badge.label}</span>
        )}
        <span className="time">{formatDuration(track.durationMs)}</span>
        <StarRating
          value={track.rating}
          compact
          ariaLabel={`Rate ${track.title}`}
          onConfirm={(rating) => onRate(track.id, rating)}
        />
        <button
          type="button"
          className="icon-btn"
          onClick={() => void api.addToQueue(track.id)}
          title="Queue"
          aria-label="Queue"
        >
          <FiList aria-hidden />
        </button>
      </div>
    </li>
  );
}
