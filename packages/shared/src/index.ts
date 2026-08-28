export type AudioFormat = 'mp3' | 'flac' | 'opus';

export type LyricStatus =
  | 'missing'
  | 'present'
  | 'instrumental'
  | 'not_found'
  | 'error';

export type LyricSource = 'local' | 'lrclib';

export type MetadataStatus = 'pending' | 'ready';

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
  /** Cached 0–10 half-star units. Null if the cache has not been populated yet. */
  rating: number | null;
  year: number | null;
  genres: string[];
  /** pending = path-only metadata; ready = tags parsed from file headers */
  metadataStatus: MetadataStatus;
}

export interface TrackPageDto {
  items: TrackDto[];
  total: number;
  page: number;
  limit: number;
}

export interface TrackPathDto {
  path: string;
}

export interface LyricLine {
  timeMs: number;
  text: string;
}

export interface LyricsDto {
  available: boolean;
  lines: LyricLine[];
}

export interface LyricSearchHitDto {
  id: number;
  title: string;
  artist: string;
  album: string | null;
  durationMs: number | null;
}

export interface LyricSearchResultDto {
  query: string;
  hits: LyricSearchHitDto[];
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
  kind: 'scan' | 'lyrics' | 'download';
  running: boolean;
  current: number;
  total: number;
  message: string | null;
}

export interface ScanIssueDto {
  path: string;
  op: 'readdir' | 'stat' | 'exists' | 'parse';
  message: string;
}

export interface LibraryStatusDto {
  trackCount: number;
  withLyrics: number;
  libraryPaths: string[];
  libraryConfigured: boolean;
  lastFullScanAt: number | null;
  scanIssues: ScanIssueDto[];
  scan: JobStatusDto;
  lyricsFetch: JobStatusDto;
  ytsaverAvailable: boolean;
  ytsaverPath: string;
  ytdlpAvailable: boolean;
  ytdlpPath: string;
}

export interface YoutubeSearchHitDto {
  id: string;
  title: string;
  uploader: string | null;
  durationMs: number | null;
}

export interface YoutubeSearchResultDto {
  query: string;
  hits: YoutubeSearchHitDto[];
}

export interface YoutubeDownloadResultDto {
  track: TrackDto;
}

export { buildPlatformSearchUrls, type PlatformSearchUrls } from './search-fallback-urls';

export interface RandomArtistDto {
  artist: string;
}

export interface AppSettingsDto {
  removePlayedFromQueue: boolean;
}

export interface SessionStateDto {
  playback: PlaybackStateDto;
  queue: QueueItemDto[];
  jobs: {
    scan: JobStatusDto;
    lyricsFetch: JobStatusDto;
    download: JobStatusDto;
  };
  settings: AppSettingsDto;
}

export interface WsClientMessage {
  type: 'hello';
  clientId: string;
}

export interface WsServerMessage {
  type: 'session';
  state: SessionStateDto;
}

export interface PlaylistSummaryDto {
  id: number;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  itemCount: number;
}

export interface PlaylistItemDto {
  id: number;
  position: number;
  addedAt: string;
  available: boolean;
  track: TrackDto;
}

export interface PlaylistDetailDto {
  id: number;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  items: PlaylistItemDto[];
}

export type PlaylistQueueMode = 'append' | 'replace';
