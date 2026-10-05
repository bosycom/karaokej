import { useEffect, useState } from 'react';
import { CoverSize, TrackDto } from '@karaokej/shared';
import { coverUrl } from '../covers/coverUrl';
import { CoverPlaceholder } from './CoverPlaceholder';

interface CoverArtProps {
  track: Pick<
    TrackDto,
    'relativePath' | 'title' | 'album' | 'coverGroup' | 'coverVersion' | 'coverStatus'
  >;
  size: number;
  variant?: CoverSize;
  onClick?: () => void;
  className?: string;
  /** Stretch the cover to the row so it covers title, artist, and tags. */
  fillRow?: boolean;
}

export function CoverArt({
  track,
  size,
  variant = 'sm',
  onClick,
  className,
  fillRow = false,
}: CoverArtProps) {
  const url = coverUrl(track, variant);
  const [failed, setFailed] = useState(false);

  // A new album in the same slot must retry rather than inherit the failure.
  useEffect(() => {
    setFailed(false);
  }, [url]);

  const seed = track.coverGroup ?? track.relativePath;
  const label = track.album
    ? `Cover art for ${track.album}`
    : `Cover art for ${track.title}`;

  const visual =
    url && !failed ? (
      <img
        className={['cover-art', className].filter(Boolean).join(' ')}
        src={url}
        width={size}
        height={size}
        alt=""
        loading="lazy"
        decoding="async"
        draggable={false}
        onError={() => setFailed(true)}
      />
    ) : (
      <CoverPlaceholder seed={seed} size={size} className={className} />
    );

  const buttonClass = fillRow ? 'cover-art-button cover-art-fill' : 'cover-art-button';

  if (!onClick) {
    return fillRow ? <span className={buttonClass}>{visual}</span> : visual;
  }

  return (
    <button
      type="button"
      className={buttonClass}
      style={fillRow ? undefined : { width: size, height: size }}
      title={label}
      aria-label={label}
      onClick={onClick}
    >
      {visual}
    </button>
  );
}
