export function formatDuration(ms: number | null | undefined): string {
  if (!ms || ms < 0) {
    return '–:––';
  }
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export type TrackSubtitleSegment =
  | { kind: 'artist'; text: string; searchable: boolean }
  | { kind: 'album'; text: string; searchable: true }
  | { kind: 'year'; text: string }
  | { kind: 'genres'; text: string }
  | { kind: 'separator'; text: string };

const SUBTITLE_SEPARATOR = ' · ';

function appendSeparator(segments: TrackSubtitleSegment[]): void {
  if (segments.length > 0) {
    segments.push({ kind: 'separator', text: SUBTITLE_SEPARATOR });
  }
}

export function trackSubtitleSegments(track: {
  artist: string | null;
  album: string | null;
  year: number | null;
  genres: string[];
}): TrackSubtitleSegment[] {
  const segments: TrackSubtitleSegment[] = [];

  segments.push({
    kind: 'artist',
    text: track.artist ?? 'Unknown artist',
    searchable: track.artist != null,
  });

  if (track.album) {
    appendSeparator(segments);
    segments.push({ kind: 'album', text: track.album, searchable: true });
    if (track.year != null) {
      segments.push({ kind: 'year', text: ` (${track.year})` });
    }
  } else if (track.year != null) {
    appendSeparator(segments);
    segments.push({ kind: 'year', text: String(track.year) });
  }

  if (track.genres.length > 0) {
    appendSeparator(segments);
    const shown = track.genres.slice(0, 3);
    let genreText = shown.join(', ');
    const remaining = track.genres.length - shown.length;
    if (remaining > 0) {
      genreText += ` +${remaining}`;
    }
    segments.push({ kind: 'genres', text: genreText });
  }

  return segments;
}

export function formatTrackSubtitle(track: {
  artist: string | null;
  album: string | null;
  year: number | null;
  genres: string[];
}): string {
  return trackSubtitleSegments(track)
    .map((segment) => segment.text)
    .join('');
}

export function lyricBadge(status: string): { label: string; tone: string } {
  switch (status) {
    case 'present':
      return { label: 'Lyrics', tone: 'ok' };
    case 'instrumental':
      return { label: 'Instrumental', tone: 'muted' };
    case 'not_found':
      return { label: 'No lyrics', tone: 'warn' };
    case 'error':
      return { label: 'Lyric error', tone: 'warn' };
    default:
      return { label: 'Missing lyrics', tone: 'muted' };
  }
}

export function formatRelativeScanTime(timestamp: number | null | undefined): string {
  if (!timestamp) {
    return 'Never';
  }
  const diffMs = Date.now() - timestamp;
  if (diffMs < 60_000) {
    return 'Just now';
  }
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 48) {
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  }
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}
