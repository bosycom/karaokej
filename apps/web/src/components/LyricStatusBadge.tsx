import { MdOutlineLyrics } from 'react-icons/md';
import { lyricBadge } from '../format';
import { ProcessingText } from './ProcessingText';

interface LyricStatusBadgeProps {
  status: string;
  fetching?: boolean;
  onFetch?: () => void;
}

export function LyricStatusBadge({ status, fetching = false, onFetch }: LyricStatusBadgeProps) {
  const badge = lyricBadge(status);
  const canFetch = status !== 'present' && onFetch != null;
  const fetchLabel = fetching ? 'Fetching…' : 'Fetch lyric';
  const icon = badge.icon ? <MdOutlineLyrics aria-hidden /> : null;
  const idle = fetching ? <ProcessingText>Fetching…</ProcessingText> : (icon ?? badge.label);

  if (canFetch) {
    return (
      <button
        type="button"
        className={
          badge.icon
            ? `status-icon ${badge.tone}${fetching ? ' status-icon-busy' : ''}`
            : `badge ${badge.tone} badge-fetch`
        }
        disabled={fetching}
        onClick={onFetch}
        title={fetchLabel}
        aria-label={fetchLabel}
      >
        {badge.icon ? (
          idle
        ) : (
          <>
            <span className="badge-idle">{idle}</span>
            {!fetching && <span className="badge-action">Fetch lyric</span>}
          </>
        )}
      </button>
    );
  }

  if (badge.icon) {
    return (
      <span className={`status-icon ${badge.tone}`} title={badge.label} aria-label={badge.label}>
        {icon}
      </span>
    );
  }

  return <span className={`badge ${badge.tone}`}>{badge.label}</span>;
}
