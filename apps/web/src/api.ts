import {
  LibraryStatusDto,
  LyricsDto,
  SessionStateDto,
  TrackDto,
  TrackPageDto,
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
  return response.json() as Promise<T>;
}

export const api = {
  libraryStatus: () => request<LibraryStatusDto>('/api/library/status'),
  scan: () => request<LibraryStatusDto>('/api/library/scan', { method: 'POST' }),
  cancelScan: () =>
    request<LibraryStatusDto>('/api/library/scan/cancel', { method: 'POST' }),
  fetchLyrics: () =>
    request<LibraryStatusDto>('/api/library/fetch-lyrics', { method: 'POST' }),
  cancelFetchLyrics: () =>
    request<LibraryStatusDto>('/api/library/fetch-lyrics/cancel', {
      method: 'POST',
    }),
  fetchTrackLyrics: (trackId: number) =>
    request<TrackDto>(`/api/tracks/${trackId}/lyrics/fetch`, { method: 'POST' }),
  tracks: (q: string, page: number, limit = 50) => {
    const params = new URLSearchParams({
      q,
      page: String(page),
      limit: String(limit),
    });
    return request<TrackPageDto>(`/api/tracks?${params}`);
  },
  lyrics: (trackId: number) => request<LyricsDto>(`/api/tracks/${trackId}/lyrics`),
  addToQueue: (trackId: number) =>
    request('/api/queue', { method: 'POST', body: JSON.stringify({ trackId }) }),
  removeFromQueue: (id: number) =>
    request(`/api/queue/${id}`, { method: 'DELETE' }),
  moveQueue: (id: number, direction: 'up' | 'down') =>
    request(`/api/queue/${id}/move`, {
      method: 'POST',
      body: JSON.stringify({ direction }),
    }),
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
  },
};
