import { ReactNode } from 'react';
import { FiPlay, FiX } from 'react-icons/fi';
import { TrackDto } from '@karaokej/shared';
import { formatDuration } from '../format';
import { CoverArt } from './CoverArt';
import { IconMenu } from './IconMenu';
import { TrackMain } from './TrackMain';

interface WorkspaceTrackRowProps {
  track: TrackDto;
  onPlay?: () => void;
  playDisabled?: boolean;
  onRemove: () => void;
  removeTitle?: string;
  removeAriaLabel?: string;
  onShowCover?: (track: TrackDto) => void;
  onApplySearchTerm?: (term: string) => void;
  extras?: ReactNode;
  labelMuted?: boolean;
  onManageTags?: (track: TrackDto) => void;
}

export function WorkspaceTrackRow({
  track,
  onPlay,
  playDisabled = false,
  onRemove,
  removeTitle = 'Remove',
  removeAriaLabel = 'Remove',
  onShowCover,
  onApplySearchTerm,
  extras,
  labelMuted = false,
  onManageTags,
}: WorkspaceTrackRowProps) {
  const playTitle = `Play ${track.title}`;
  return (
    <>
      <CoverArt
        track={track}
        size={32}
        fillRow={track.tags.length > 0}
        onClick={onShowCover ? () => onShowCover(track) : undefined}
      />
      <TrackMain track={track} muted={labelMuted} onApplySearchTerm={onApplySearchTerm} />
      <div className="track-meta">
        {extras}
        <span className="time">{formatDuration(track.durationMs)}</span>
        {onPlay ? (
          <button
            type="button"
            className="icon-btn"
            disabled={playDisabled}
            title={playTitle}
            aria-label={playTitle}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={onPlay}
          >
            <FiPlay aria-hidden />
          </button>
        ) : null}
        <button
          type="button"
          className="icon-btn"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={onRemove}
          title={removeTitle}
          aria-label={removeAriaLabel}
        >
          <FiX aria-hidden />
        </button>
        {onManageTags ? (
          <div onPointerDown={(event) => event.stopPropagation()}>
            <IconMenu
              ariaLabel={`Actions for ${track.title}`}
              items={[
                {
                  id: 'manage-tags',
                  label: 'Manage tags',
                  onSelect: () => onManageTags(track),
                },
              ]}
            />
          </div>
        ) : null}
      </div>
    </>
  );
}
