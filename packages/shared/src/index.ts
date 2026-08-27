export type AudioFormat = 'mp3' | 'flac' | 'opus';

export type LyricStatus =
  | 'missing'
  | 'present'
  | 'instrumental'
  | 'not_found'
  | 'error';

export type LyricSource = 'local' | 'lrclib';

export interface TrackDto {
  id: number;
  relativePath: string;
  title: string;
  artist: string | null;
  album: string | null;
  albumArtist: string | null;
  trackNo: number | null;
  durationMs: number | null;
  format: AudioFormat;
  lyricStatus: LyricStatus;
  lyricSource: LyricSource | null;
}

export interface TrackPageDto {
  items: TrackDto[];
  total: number;
  page: number;
  limit: number;
}

export interface LyricLine {
  timeMs: number;
  text: string;
}

export interface LyricsDto {
  available: boolean;
  lines: LyricLine[];
}

export interface QueueItemDto {
  id: number;
  position: number;
  addedAt: string;
  track: TrackDto;
}

export type PlaybackStatus = 'idle' | 'playing' | 'paused';

export interface PlaybackStateDto {
  currentQueueItemId: number | null;
  currentTrack: TrackDto | null;
  status: PlaybackStatus;
  positionMs: number;
  volume: number;
  playerClientId: string | null;
  seekSeq: number;
}

export interface JobStatusDto {
  kind: 'scan' | 'lyrics';
  running: boolean;
  current: number;
  total: number;
  message: string | null;
}

export interface LibraryStatusDto {
  trackCount: number;
  withLyrics: number;
  libraryPath: string | null;
  libraryConfigured: boolean;
  scan: JobStatusDto;
  lyricsFetch: JobStatusDto;
}

export interface SessionStateDto {
  playback: PlaybackStateDto;
  queue: QueueItemDto[];
  jobs: {
    scan: JobStatusDto;
    lyricsFetch: JobStatusDto;
  };
}

export interface WsClientMessage {
  type: 'hello';
  clientId: string;
}

export interface WsServerMessage {
  type: 'session';
  state: SessionStateDto;
}
