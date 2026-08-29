import { useDraggable } from '@dnd-kit/core';
import { FiEdit2, FiPlay, FiTag } from 'react-icons/fi';
import { TrackDto } from '@karaokej/shared';
import { api } from '../api';
import { trackDragId } from '../dnd/dragIds';
import { formatDuration, karaokeStemBadge, trackSubtitleSegments } from '../format';
import { IconMenu } from './IconMenu';
import { LyricStatusBadge } from './LyricStatusBadge';
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
  onEditMetadata: (track: TrackDto) => void;
}

export function DraggableTrackRow({
  track,
  fetching,
  onFetchLyrics,
  onRate,
  onApplySearchTerm,
  onPlay,
  onEditMetadata,
}: DraggableTrackRowProps) {
  const { listeners, setNodeRef, isDragging } = useDraggable({
    id: trackDragId(track.id),
    data: { kind: 'track', track },
  });
  const stemBadge = karaokeStemBadge(track.karaokeStemStatus);
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
        <LyricStatusBadge
          status={track.lyricStatus}
          fetching={fetching}
          onFetch={() => onFetchLyrics(track.id)}
        />
        {tagsPending ? (
          <span
            className="status-icon warn"
            title="Filename only; tags not read yet"
            aria-label="Tags pending"
          >
            <FiTag aria-hidden />
          </span>
        ) : null}
        {stemBadge ? (
          <span className={`badge ${stemBadge.tone}`} title={stemBadge.title}>
            {stemBadge.processing ? (
              <ProcessingText>{stemBadge.label}</ProcessingText>
            ) : (
              stemBadge.label
            )}
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
        <button
          type="button"
          className="icon-btn"
          title={`Edit metadata for ${track.title}`}
          aria-label={`Edit metadata for ${track.title}`}
          onClick={() => onEditMetadata(track)}
        >
          <FiEdit2 aria-hidden />
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
