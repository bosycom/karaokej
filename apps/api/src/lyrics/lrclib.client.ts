import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';

export interface LrclibRecord {
  id: number;
  trackName: string;
  artistName: string;
  albumName: string;
  duration: number;
  instrumental: boolean;
  plainLyrics: string | null;
  syncedLyrics: string | null;
}

const USER_AGENT = 'Karaokej/0.1.0 (self-hosted karaoke)';
const MIN_SPACING_MS = 350;

@Injectable()
export class LrclibClient {
  private readonly logger = new Logger(LrclibClient.name);
  private nextAllowedAt = 0;

  constructor(private readonly config: AppConfigService) {}

  async waitForSpacing(): Promise<void> {
    const wait = this.nextAllowedAt - Date.now();
    if (wait > 0) {
      await sleep(wait);
    }
  }

  async searchQuery(q: string): Promise<LrclibRecord[]> {
    const query = new URLSearchParams({ q });
    const data = await this.request(`/api/search?${query.toString()}`);
    return Array.isArray(data) ? (data as LrclibRecord[]) : [];
  }

  async getById(id: number): Promise<LrclibRecord | null> {
    const data = await this.request(`/api/get/${id}`);
    if (!data) {
      return null;
    }
    return data as LrclibRecord;
  }

  async getBest(params: {
    trackName: string;
    artistName: string;
    albumName: string | null;
    durationSec: number | null;
  }): Promise<LrclibRecord | null> {
    const signature = await this.get(params);
    if (signature) {
      return signature;
    }
    if (params.durationSec && params.durationSec > 0) {
      const searched = await this.search(params);
      return this.pickDurationMatch(searched, params.durationSec);
    }
    return null;
  }

  private async get(params: {
    trackName: string;
    artistName: string;
    albumName: string | null;
    durationSec: number | null;
  }): Promise<LrclibRecord | null> {
    const query = new URLSearchParams({
      track_name: params.trackName,
      artist_name: params.artistName,
    });
    if (params.albumName) {
      query.set('album_name', params.albumName);
    }
    if (params.durationSec && params.durationSec >= 1 && params.durationSec <= 3600) {
      query.set('duration', String(Math.round(params.durationSec)));
    }
    const data = await this.request(`/api/get?${query.toString()}`);
    if (!data) {
      return null;
    }
    return data as LrclibRecord;
  }

  private async search(params: {
    trackName: string;
    artistName: string;
    albumName: string | null;
  }): Promise<LrclibRecord[]> {
    const query = new URLSearchParams({
      track_name: params.trackName,
      artist_name: params.artistName,
    });
    if (params.albumName) {
      query.set('album_name', params.albumName);
    }
    const data = await this.request(`/api/search?${query.toString()}`);
    return Array.isArray(data) ? (data as LrclibRecord[]) : [];
  }

  private pickDurationMatch(
    records: LrclibRecord[],
    durationSec: number,
  ): LrclibRecord | null {
    const withSynced = records.filter((r) => r.syncedLyrics?.trim());
    const close = withSynced.filter(
      (r) => Math.abs((r.duration ?? 0) - durationSec) <= 2,
    );
    return close[0] ?? null;
  }

  private async request(path: string, attempt = 0): Promise<unknown | null> {
    await this.waitForSpacing();
    const url = `${this.config.lrclibBaseUrl}${path}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Lrclib-Client': USER_AGENT,
      },
    });
    this.nextAllowedAt = Date.now() + MIN_SPACING_MS;

    if (response.status === 404) {
      return null;
    }
    if (response.status === 429) {
      const retryAfter = Number(response.headers.get('Retry-After') ?? 2);
      const waitMs = Math.max(1, retryAfter) * 1000;
      this.logger.warn(`LRCLIB rate limited, waiting ${waitMs}ms`);
      await sleep(waitMs);
      this.nextAllowedAt = Date.now() + MIN_SPACING_MS;
      if (attempt < 3) {
        return this.request(path, attempt + 1);
      }
      throw new Error('LRCLIB rate limit exceeded');
    }
    if (!response.ok) {
      throw new Error(`LRCLIB HTTP ${response.status}`);
    }
    return response.json();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
