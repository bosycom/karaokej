import { CoverSize, TrackDto } from '@karaokej/shared';

type CoverFields = Pick<TrackDto, 'coverGroup' | 'coverVersion' | 'coverStatus'>;

/**
 * URLs are keyed by album group so every row of one album shares a single
 * request. Appending the content hash lets the server mark it immutable.
 */
export function coverUrl(track: CoverFields, size: CoverSize): string | null {
  if (!track.coverGroup) {
    return null;
  }
  if (track.coverStatus === 'none') {
    return null;
  }
  const version = track.coverVersion ? `?v=${track.coverVersion}` : '';
  return `/api/covers/${track.coverGroup}/${size}${version}`;
}

export function hasResolvedCover(track: CoverFields): boolean {
  return track.coverStatus === 'ready' && Boolean(track.coverVersion);
}
