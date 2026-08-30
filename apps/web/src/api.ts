import {
  AppSettingsDto,
  KaraokeMode,
  KaraokeSettingsDto,
  KaraokeStateDto,
  KaraokeTrackSettings,
  LibraryStatusDto,
  LyricSearchResultDto,
  LyricsDto,
  PlaylistDetailDto,
  PlaylistQueueMode,
  PlaylistSummaryDto,
  QueueItemDto,
  RandomArtistDto,
  SessionStateDto,
  TrackDto,
  TrackMetadataDto,
  TrackMetadataUpdateDto,
  TrackPageDto,
  TrackPathDto,
  YoutubeDownloadResultDto,
  YoutubeSearchResultDto,
  defaultKaraokeState,
} from '@karaokej/shared';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });
  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = await response.json();
      detail = body.message ?? JSON.stringify(body);
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  const text = await response.text();
  if (!text.trim()) {
    return undefined as T;
  }
  return JSON.parse(text) as T;
}

export const api = {
  libraryStatus: () => request<LibraryStatusDto>('/api/library/status'),
  randomArtist: (exclude?: string) => {
    const params = new URLSearchParams();
    if (exclude?.trim()) {
      params.set('exclude', exclude.trim());
    }
    const query = params.toString();
    return request<RandomArtistDto>(
      `/api/library/artists/random${query ? `?${query}` : ''}`,
    );
  },
  scan: () => request<LibraryStatusDto>('/api/library/scan', { method: 'POST' }),
  cancelScan: () =>
    request<LibraryStatusDto>('/api/library/scan/cancel', { method: 'POST' }),
  refreshScan: () =>
    request<LibraryStatusDto>('/api/library/scan/refresh', { method: 'POST' }),
  fetchLyrics: () =>
    request<LibraryStatusDto>('/api/library/fetch-lyrics', { method: 'POST' }),
  cancelFetchLyrics: () =>
    request<LibraryStatusDto>('/api/library/fetch-lyrics/cancel', {
      method: 'POST',
    }),
  fetchTrackLyrics: (trackId: number) =>
    request<TrackDto>(`/api/tracks/${trackId}/lyrics/fetch`, { method: 'POST' }),
  searchTrackLyrics: (trackId: number, q: string) => {
    const params = new URLSearchParams({ q });
    return request<LyricSearchResultDto>(
      `/api/tracks/${trackId}/lyrics/search?${params.toString()}`,
    );
  },
  applyTrackLyrics: (trackId: number, lrclibId: number) =>
    request<TrackDto>(`/api/tracks/${trackId}/lyrics/apply`, {
      method: 'POST',
      body: JSON.stringify({ lrclibId }),
    }),
  markLyricsUnavailable: (trackId: number) =>
    request<TrackDto>(`/api/tracks/${trackId}/lyrics/unavailable`, {
      method: 'POST',
    }),
  tracks: (
    q: string,
    page: number,
    limit = 15,
    minRating = 0,
    hideDuplicates = false,
  ) => {
    const params = new URLSearchParams({
      q,
      page: String(page),
      limit: String(limit),
    });
    if (minRating > 0) {
      params.set('minRating', String(minRating));
    }
    if (hideDuplicates) {
      params.set('hideDuplicates', '1');
    }
    return request<TrackPageDto>(`/api/tracks?${params}`);
  },
  setTrackRating: (trackId: number, rating: number) =>
    request<TrackDto>(`/api/tracks/${trackId}/rating`, {
      method: 'PUT',
      body: JSON.stringify({ rating }),
    }),
  readTrackMetadata: (trackId: number) =>
    request<TrackMetadataDto>(`/api/tracks/${trackId}/metadata`),
  updateTrackMetadata: (trackId: number, metadata: TrackMetadataUpdateDto) =>
    request<TrackDto>(`/api/tracks/${trackId}/metadata`, {
      method: 'PUT',
      body: JSON.stringify(metadata),
    }),
  trackPath: (trackId: number) =>
    request<TrackPathDto>(`/api/tracks/${trackId}/path`),
  deleteTrack: (trackId: number) =>
    request<void>(`/api/tracks/${trackId}`, { method: 'DELETE' }),
  lyrics: (trackId: number) => request<LyricsDto>(`/api/tracks/${trackId}/lyrics`),
  addToQueue: (trackId: number, placement: 'end' | 'after_current' = 'end') =>
    request<QueueItemDto[]>('/api/queue', {
      method: 'POST',
      body: JSON.stringify({ trackId, placement }),
    }),
  playTrackNow: async (trackId: number) => {
    const queue = await request<QueueItemDto[]>('/api/queue', {
      method: 'POST',
      body: JSON.stringify({ trackId }),
    });
    const added = queue.at(-1);
    if (added) {
      await request('/api/playback/play-item', {
        method: 'POST',
        body: JSON.stringify({ queueItemId: added.id }),
      });
    }
  },
  removeFromQueue: (id: number) =>
    request(`/api/queue/${id}`, { method: 'DELETE' }),
  clearQueue: (mode: 'all' | 'except_current' | 'before_current' = 'all') => {
    const query =
      mode === 'all' ? '' : `?mode=${encodeURIComponent(mode)}`;
    return request<QueueItemDto[]>(`/api/queue${query}`, { method: 'DELETE' });
  },
  reorderQueue: (ids: number[]) =>
    request('/api/queue/reorder', {
      method: 'PATCH',
      body: JSON.stringify({ ids }),
    }),
  shuffleQueue: () =>
    request<QueueItemDto[]>('/api/queue/shuffle', { method: 'POST' }),
  play: () => request('/api/playback/play', { method: 'POST' }),
  pause: () => request('/api/playback/pause', { method: 'POST' }),
  seek: (positionMs: number) =>
    request('/api/playback/seek', {
      method: 'POST',
      body: JSON.stringify({ positionMs }),
    }),
  volume: (volume: number) =>
    request('/api/playback/volume', {
      method: 'POST',
      body: JSON.stringify({ volume }),
    }),
  skip: () => request('/api/playback/skip', { method: 'POST' }),
  ended: (clientId: string) =>
    request('/api/playback/ended', {
      method: 'POST',
      body: JSON.stringify({ clientId }),
    }),
  checkpoint: (positionMs: number, clientId: string) =>
    request('/api/playback/checkpoint', {
      method: 'POST',
      body: JSON.stringify({ positionMs, clientId }),
    }),
  playItem: (queueItemId: number) =>
    request('/api/playback/play-item', {
      method: 'POST',
      body: JSON.stringify({ queueItemId }),
    }),
  claim: (clientId: string) =>
    request('/api/playback/claim', {
      method: 'POST',
      body: JSON.stringify({ clientId }),
    }),
  session: () => request<SessionStateDto>('/api/session'),
  getSettings: () => request<AppSettingsDto>('/api/settings'),
  patchSettings: (partial: Partial<AppSettingsDto>) =>
    request<AppSettingsDto>('/api/settings', {
      method: 'PATCH',
      body: JSON.stringify(partial),
    }),
  playlists: () => request<PlaylistSummaryDto[]>('/api/playlists'),
  playlist: (id: number) => request<PlaylistDetailDto>(`/api/playlists/${id}`),
  createPlaylist: (name: string, description?: string | null) =>
    request<PlaylistDetailDto>('/api/playlists', {
      method: 'POST',
      body: JSON.stringify({ name, description }),
    }),
  updatePlaylist: (
    id: number,
    patch: { name?: string; description?: string | null },
  ) =>
    request<PlaylistDetailDto>(`/api/playlists/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  deletePlaylist: (id: number) =>
    request<void>(`/api/playlists/${id}`, { method: 'DELETE' }),
  addToPlaylist: (playlistId: number, trackId: number) =>
    request<PlaylistDetailDto>(`/api/playlists/${playlistId}/items`, {
      method: 'POST',
      body: JSON.stringify({ trackId }),
    }),
  removeFromPlaylist: (playlistId: number, itemId: number) =>
    request<PlaylistDetailDto>(`/api/playlists/${playlistId}/items/${itemId}`, {
      method: 'DELETE',
    }),
  reorderPlaylistItems: (playlistId: number, ids: number[]) =>
    request<PlaylistDetailDto>(`/api/playlists/${playlistId}/items/reorder`, {
      method: 'PATCH',
      body: JSON.stringify({ ids }),
    }),
  loadPlaylistIntoQueue: (playlistId: number, mode: PlaylistQueueMode) =>
    request<QueueItemDto[]>(`/api/playlists/${playlistId}/queue`, {
      method: 'POST',
      body: JSON.stringify({ mode }),
    }),
  launchYtsaver: () =>
    request<{ ok: true }>('/api/external/ytsaver/launch', { method: 'POST' }),
  searchYoutube: (q: string) => {
    const params = new URLSearchParams({ q });
    return request<YoutubeSearchResultDto>(
      `/api/external/youtube/search?${params.toString()}`,
    );
  },
  downloadYoutube: (videoId: string) =>
    request<YoutubeDownloadResultDto>('/api/external/youtube/download', {
      method: 'POST',
      body: JSON.stringify({ videoId }),
    }),
  getKaraokeSettings: (trackId: number) =>
    request<KaraokeSettingsDto>(`/api/tracks/${trackId}/karaoke-settings`),
  saveKaraokeSettings: (trackId: number, settings: KaraokeTrackSettings) =>
    request<KaraokeSettingsDto>(`/api/tracks/${trackId}/karaoke-settings`, {
      method: 'PUT',
      body: JSON.stringify(settings),
    }),
  resetKaraokeSettings: (trackId: number) =>
    request<KaraokeSettingsDto>(`/api/tracks/${trackId}/karaoke-settings`, {
      method: 'DELETE',
    }),
  setKaraokeMode: (mode: KaraokeMode) =>
    request<KaraokeStateDto>('/api/karaoke/mode', {
      method: 'PUT',
      body: JSON.stringify({ mode }),
    }),
  patchKaraokeLive: (patch: Partial<KaraokeTrackSettings> & { trackId?: number }) =>
    request<KaraokeStateDto>('/api/karaoke/live', {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  getKaraokeState: () => request<KaraokeStateDto>('/api/karaoke/state'),
  separateTrack: (trackId: number) =>
    request<KaraokeStateDto>(`/api/karaoke/tracks/${trackId}/separate`, {
      method: 'POST',
    }),
  cancelSeparation: () =>
    request<KaraokeStateDto>('/api/karaoke/separation', { method: 'DELETE' }),
  removeKaraokeStem: (trackId: number) =>
    request<KaraokeStateDto>(`/api/karaoke/tracks/${trackId}/stem`, {
      method: 'DELETE',
    }),
};

export function wsUrl(): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws`;
}

export const emptySession: SessionStateDto = {
  playback: {
    currentQueueItemId: null,
    currentTrack: null,
    status: 'idle',
    positionMs: 0,
    volume: 1,
    playerClientId: null,
    seekSeq: 0,
  },
  queue: [],
  jobs: {
    scan: { kind: 'scan', running: false, current: 0, total: 0, message: null },
    lyricsFetch: {
      kind: 'lyrics',
      running: false,
      current: 0,
      total: 0,
      message: null,
    },
    download: {
      kind: 'download',
      running: false,
      current: 0,
      total: 0,
      message: null,
    },
    separation: {
      kind: 'separation',
      running: false,
      current: 0,
      total: 0,
      message: null,
    },
  },
  settings: {
    removePlayedFromQueue: false,
    crossfadeSeconds: 0,
    crossfadePrefSeconds: 5,
  },
  karaoke: defaultKaraokeState(),
};
