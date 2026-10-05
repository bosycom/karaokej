import { HTMLAttributes } from 'react';
import { TrackDto } from '@karaokej/shared';
import { trackSubtitleSegments } from '../format';
import { TrackSearchTerm } from './TrackSearchTerm';

interface TrackMainProps extends HTMLAttributes<HTMLDivElement> {
  track: TrackDto;
  muted?: boolean;
  onApplySearchTerm?: (term: string) => void;
}

export function TrackMain({
  track,
  muted = false,
  onApplySearchTerm,
  className,
  ...rest
}: TrackMainProps) {
  return (
    <div
      className={`track-main${muted ? ' muted' : ''}${className ? ` ${className}` : ''}`}
      {...rest}
    >
      <strong>
        {onApplySearchTerm ? (
          <TrackSearchTerm term={track.title} onApplySearchTerm={onApplySearchTerm} />
        ) : (
          track.title
        )}
      </strong>
      <span>
        {trackSubtitleSegments(track).map((segment, index) => {
          if (onApplySearchTerm && segment.kind === 'artist' && segment.searchable) {
            return (
              <TrackSearchTerm
                key={`artist-${index}`}
                term={segment.text}
                onApplySearchTerm={onApplySearchTerm}
              />
            );
          }
          if (onApplySearchTerm && segment.kind === 'album') {
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
      {track.tags.length > 0 ? (
        <span className="track-tags">{track.tags.join(', ')}</span>
      ) : null}
    </div>
  );
}

export function isInteractiveTrackTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    Boolean(
      target.closest(
        'button, a, input, .track-search-term, .icon-menu, .star-rating, .status-icon',
      ),
    )
  );
}
