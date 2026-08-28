import { AudioFormat, LyricSource, LyricStatus, TrackDto } from '@karaokej/shared';

export interface TrackRow {
  id: number;
  relative_path: string;
  format: AudioFormat;
  size_bytes: number;
  mtime_ms: number;
  title: string;
  artist: string | null;
  album: string | null;
  album_artist: string | null;
  track_no: number | null;
  duration_ms: number | null;
  lyric_status: LyricStatus;
  lyric_source: LyricSource | null;
  lyric_checked_at: number | null;
  lrclib_id: number | null;
  fingerprint: string | null;
  rating: number | null;
  available: number;
  created_at: number;
  updated_at: number;
}

export function trackToDto(row: TrackRow): TrackDto {
  return {
    id: row.id,
    relativePath: row.relative_path,
    title: row.title,
    artist: row.artist,
    album: row.album,
    albumArtist: row.album_artist,
    trackNo: row.track_no,
    durationMs: row.duration_ms,
    format: row.format,
    lyricStatus: row.lyric_status,
    lyricSource: row.lyric_source,
    rating: row.rating,
  };
}

export interface QueueRow {
  id: number;
  track_id: number;
  position: number;
  added_at: number;
}

export interface PlaybackRow {
  id: number;
  current_queue_item_id: number | null;
  status: 'idle' | 'playing' | 'paused';
  position_ms: number;
  volume: number;
  player_client_id: string | null;
  seek_seq: number;
  updated_at: number;
}

export interface JobRow {
  kind: 'scan' | 'lyrics';
  running: number;
  current: number;
  total: number;
  message: string | null;
  updated_at: number;
}

export interface PlaylistRow {
  id: number;
  name: string;
  description: string | null;
  created_at: number;
  updated_at: number;
}

export interface PlaylistItemRow {
  id: number;
  playlist_id: number;
  track_id: number;
  position: number;
  added_at: number;
}
