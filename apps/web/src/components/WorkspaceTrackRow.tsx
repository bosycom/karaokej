import { ReactNode } from 'react';
import { FiPlay, FiX } from 'react-icons/fi';
import { TrackDto } from '@karaokej/shared';
import { formatDuration } from '../format';
import { CoverArt } from './CoverArt';

interface WorkspaceTrackLabelProps {
  track: TrackDto;
  muted?: boolean;
}

export function WorkspaceTrackLabel({ track, muted = false }: WorkspaceTrackLabelProps) {
  return (
    <div className={`workspace-track-label${muted ? ' muted' : ''}`}>
      {track.artist ? (
        <>
          <span className="workspace-track-artist">{track.artist}</span>
          <span className="workspace-track-sep"> — </span>
        </>
      ) : null}
      <strong>{track.title}</strong>
    </div>
  );
}

interface WorkspaceTrackRowProps {
  track: TrackDto;
  onPlay?: () => void;
  playDisabled?: boolean;
  onRemove: () => void;
  removeTitle?: string;
  removeAriaLabel?: string;
  onShowCover?: (track: TrackDto) => void;
  extras?: ReactNode;
  labelMuted?: boolean;
}

export function WorkspaceTrackRow({
  track,
  onPlay,
  playDisabled = false,
  onRemove,
  removeTitle = 'Remove',
  removeAriaLabel = 'Remove',
  onShowCover,
  extras,
  labelMuted = false,
}: WorkspaceTrackRowProps) {
  const playTitle = `Play ${track.title}`;
  return (
    <>
      <CoverArt
        track={track}
        size={32}
        onClick={onShowCover ? () => onShowCover(track) : undefined}
      />
      <WorkspaceTrackLabel track={track} muted={labelMuted} />
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
      </div>
    </>
  );
}
