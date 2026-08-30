import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';

export interface AudioDbArtistRecord {
  idArtist: string | null;
  strArtist: string | null;
  strBiographyEN: string | null;
  strBiography: string | null;
  strGenre: string | null;
  strStyle: string | null;
  strMood: string | null;
  strCountry: string | null;
  intFormedYear: string | null;
  strMusicBrainzID: string | null;
}

export interface AudioDbDiscographyRecord {
  strAlbum: string | null;
  intYearReleased: string | null;
}

export interface AudioDbTopTrackRecord {
  strTrack: string | null;
}

const USER_AGENT = 'Karaokej/0.1.0 (self-hosted karaoke)';
const MIN_SPACING_MS = 350;

@Injectable()
export class AudioDbClient {
  private readonly logger = new Logger(AudioDbClient.name);
  private nextAllowedAt = 0;

  constructor(private readonly config: AppConfigService) {}

  async lookupArtistByMbid(mbid: string): Promise<AudioDbArtistRecord | null> {
    const data = await this.request<{ artists: AudioDbArtistRecord[] | null }>(
      `artist-mb.php?i=${encodeURIComponent(mbid)}`,
    );
    return data?.artists?.[0] ?? null;
  }

  async searchArtist(name: string): Promise<AudioDbArtistRecord[]> {
    const data = await this.request<{ artists: AudioDbArtistRecord[] | null }>(
      `search.php?s=${encodeURIComponent(name)}`,
    );
    return data?.artists ?? [];
  }

  async lookupArtistById(id: string): Promise<AudioDbArtistRecord | null> {
    const data = await this.request<{ artists: AudioDbArtistRecord[] | null }>(
      `artist.php?i=${encodeURIComponent(id)}`,
    );
    return data?.artists?.[0] ?? null;
  }

  async fetchDiscographyByName(name: string): Promise<AudioDbDiscographyRecord[]> {
    const data = await this.request<{ album: AudioDbDiscographyRecord[] | null }>(
      `discography.php?s=${encodeURIComponent(name)}`,
    );
    return data?.album ?? [];
  }

  async fetchDiscographyByMbid(mbid: string): Promise<AudioDbDiscographyRecord[]> {
    const data = await this.request<{ album: AudioDbDiscographyRecord[] | null }>(
      `discography-mb.php?s=${encodeURIComponent(mbid)}`,
    );
    return data?.album ?? [];
  }

  async fetchTopTracksByName(name: string): Promise<AudioDbTopTrackRecord[]> {
    const data = await this.request<{ track: AudioDbTopTrackRecord[] | null }>(
      `track-top10.php?s=${encodeURIComponent(name)}`,
    );
    return data?.track ?? [];
  }

  async fetchTopTracksByMbid(mbid: string): Promise<AudioDbTopTrackRecord[]> {
    const data = await this.request<{ track: AudioDbTopTrackRecord[] | null }>(
      `track-top10-mb.php?s=${encodeURIComponent(mbid)}`,
    );
    return data?.track ?? [];
  }

  private async request<T>(path: string, attempt = 0): Promise<T | null> {
    await this.waitForSpacing();
    const url = `${this.config.audiodbBaseUrl}/${this.config.audiodbApiKey}/${path}`;
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
      this.logger.warn(`TheAudioDB rate limited, waiting ${waitMs}ms`);
      await sleep(waitMs);
      this.nextAllowedAt = Date.now() + MIN_SPACING_MS;
      if (attempt < 3) {
        return this.request(path, attempt + 1);
      }
      throw new Error('TheAudioDB rate limit exceeded');
    }
    if (!response.ok) {
      throw new Error(`TheAudioDB HTTP ${response.status}`);
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
