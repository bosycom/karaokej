import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import {
  DeezerArtistHit,
  DeezerTrackHit,
  mapDeezerTopTracks,
  pickDeezerArtist,
} from './deezer-utils';

const USER_AGENT = 'Karaokej/0.1.0 (self-hosted karaoke)';
const MIN_SPACING_MS = 350;
const DEFAULT_TOP_TRACK_LIMIT = 10;

interface DeezerSearchArtistResponse {
  data?: Array<{ id: number; name: string }> | null;
}

interface DeezerTopTracksResponse {
  data?: Array<{ title: string | null }> | null;
}

@Injectable()
export class DeezerClient {
  private readonly logger = new Logger(DeezerClient.name);
  private nextAllowedAt = 0;

  constructor(private readonly config: AppConfigService) {}

  async searchArtist(name: string): Promise<DeezerArtistHit[]> {
    const data = await this.request<DeezerSearchArtistResponse>(
      `search/artist?q=${encodeURIComponent(name)}`,
    );
    return (data?.data ?? []).map((artist) => ({
      id: artist.id,
      name: artist.name,
    }));
  }

  async fetchTopTracks(
    artistId: number,
    limit = DEFAULT_TOP_TRACK_LIMIT,
  ): Promise<{ name: string }[]> {
    const data = await this.request<DeezerTopTracksResponse>(
      `artist/${artistId}/top?limit=${limit}`,
    );
    return mapDeezerTopTracks(data?.data ?? [], limit);
  }

  async fetchTopTracksForArtist(
    name: string,
    limit = DEFAULT_TOP_TRACK_LIMIT,
  ): Promise<{ name: string }[]> {
    const trimmed = name.trim();
    if (!trimmed) {
      return [];
    }
    const artists = await this.searchArtist(trimmed);
    const picked = pickDeezerArtist(artists, trimmed);
    if (!picked) {
      return [];
    }
    return this.fetchTopTracks(picked.id, limit);
  }

  private async request<T>(path: string, attempt = 0): Promise<T | null> {
    await this.waitForSpacing();
    const url = `${this.config.deezerBaseUrl}/${path.replace(/^\//, '')}`;
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
    });
    this.nextAllowedAt = Date.now() + MIN_SPACING_MS;

    if (response.status === 404) {
      return null;
    }
    if (response.status === 429) {
      const retryAfter = Number(response.headers.get('Retry-After') ?? 2);
      const waitMs = Math.max(1, retryAfter) * 1000;
      this.logger.warn(`Deezer rate limited, waiting ${waitMs}ms`);
      await sleep(waitMs);
      this.nextAllowedAt = Date.now() + MIN_SPACING_MS;
      if (attempt < 3) {
        return this.request(path, attempt + 1);
      }
      throw new Error('Deezer rate limit exceeded');
    }
    if (!response.ok) {
      throw new Error(`Deezer HTTP ${response.status}`);
    }
    return (await response.json()) as T;
  }

  private async waitForSpacing(): Promise<void> {
    const wait = this.nextAllowedAt - Date.now();
    if (wait > 0) {
      await sleep(wait);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
