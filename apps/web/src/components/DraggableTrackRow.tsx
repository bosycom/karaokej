import { useDraggable } from '@dnd-kit/core';
import { FiPlay } from 'react-icons/fi';
import { TrackDto } from '@karaokej/shared';
import { api } from '../api';
import { trackDragId } from '../dnd/dragIds';
import { formatDuration, karaokeStemBadge, lyricBadge, trackSubtitleSegments } from '../format';
import { IconMenu } from './IconMenu';
import { ProcessingText } from './ProcessingText';
import { StarRating } from './StarRating';
import { TrackSearchTerm } from './TrackSearchTerm';

interface DraggableTrackRowProps {
  track: TrackDto;
  fetching: boolean;
  onFetchLyrics: (trackId: number) => void;
  onRate: (trackId: number, rating: number) => void;
  onApplySearchTerm: (term: string) => void;
  onPlay: (track: TrackDto) => void;
}

export function DraggableTrackRow({
  track,
  fetching,
  onFetchLyrics,
  onRate,
  onApplySearchTerm,
  onPlay,
}: DraggableTrackRowProps) {
  const { listeners, setNodeRef, isDragging } = useDraggable({
    id: trackDragId(track.id),
    data: { kind: 'track', track },
  });
  const badge = lyricBadge(track.lyricStatus);
  const stemBadge = karaokeStemBadge(track.karaokeStemStatus);
  const canFetch = track.lyricStatus !== 'present';
  const fetchLabel = fetching ? 'Fetching…' : 'Fetch lyric';
  const tagsPending = track.metadataStatus === 'pending';

  const copyFilePath = async () => {
    const { path } = await api.trackPath(track.id);
    await navigator.clipboard.writeText(path);
  };

  return (
    <li ref={setNodeRef} className={isDragging ? 'dragging' : undefined}>
      <div className="track-main" title="Drag to add to queue" {...listeners}>
        <strong>
          <TrackSearchTerm term={track.title} onApplySearchTerm={onApplySearchTerm} />
        </strong>
        <span>
          {trackSubtitleSegments(track).map((segment, index) => {
            if (segment.kind === 'artist' && segment.searchable) {
              return (
                <TrackSearchTerm
                  key={`artist-${index}`}
                  term={segment.text}
                  onApplySearchTerm={onApplySearchTerm}
                />
              );
            }
            if (segment.kind === 'album') {
              return (
                <TrackSearchTerm
                  key={`album-${index}`}
                  term={segment.text}
                  onApplySearchTerm={onApplySearchTerm}
                />
              );
            }
            return <span key={`${segment.kind}-${index}`}>{segment.text}</span>;
          })}
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
        {stemBadge ? (
          <span className={`badge ${stemBadge.tone}`} title={stemBadge.title}>
            {stemBadge.processing ? (
              <ProcessingText>{stemBadge.label}</ProcessingText>
            ) : (
              stemBadge.label
            )}
          </span>
        ) : null}
        {tagsPending ? (
          <span className="badge warn" title="Tags not read yet">
            Tags pending
          </span>
        ) : null}
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
          title={`Play ${track.title}`}
          aria-label={`Play ${track.title}`}
          onClick={() => onPlay(track)}
        >
          <FiPlay aria-hidden />
        </button>
        <IconMenu
          ariaLabel={`Actions for ${track.title}`}
          items={[
            {
              id: 'copy-file-path',
              label: 'Copy file path',
              onSelect: copyFilePath,
            },
          ]}
        />
      </div>
    </li>
  );
}
