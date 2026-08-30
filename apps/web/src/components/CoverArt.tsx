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
}

export function CoverArt({
  track,
  size,
  variant = 'sm',
  onClick,
  className,
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

  if (!onClick) {
    return visual;
  }

  return (
    <button
      type="button"
      className="cover-art-button"
      style={{ width: size, height: size }}
      title={label}
      aria-label={label}
      onClick={onClick}
    >
      {visual}
    </button>
  );
}
