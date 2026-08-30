import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ArtistBioAlbumDto,
  ArtistBioChooseDto,
  ArtistBioChoiceDto,
  ArtistBioDto,
  ArtistBioTrackDto,
} from '@karaokej/shared';
import { DbService } from '../db/db.service';
import { TrackRow } from '../db/types';
import { LibraryService } from '../library/library.service';
import {
  AudioDbArtistRecord,
  AudioDbClient,
  AudioDbDiscographyRecord,
  AudioDbTopTrackRecord,
} from './audiodb.client';
import {
  biographyFromArtistRecord,
  hasLocalArtistAmbiguity,
  localArtistChoices,
  mbidLookupKey,
  nameLookupKey,
  preferredArtistName,
  searchNameVariants,
  stringField,
} from './artist-bio-utils';

interface ArtistBioRow {
  lookup_key: string;
  display_name: string | null;
  audiodb_id: string | null;
  musicbrainz_id: string | null;
  status: 'ready' | 'not_found';
  biography: string | null;
  genre: string | null;
  style: string | null;
  mood: string | null;
  country: string | null;
  formed_year: string | null;
  albums_json: string | null;
  top_tracks_json: string | null;
  fetched_at: number;
  extras_fetched_at: number | null;
}

@Injectable()
export class ArtistBioService {
  constructor(
    private readonly db: DbService,
    private readonly library: LibraryService,
    private readonly audiodb: AudioDbClient,
  ) {}

  getForTrack(trackId: number, chosenName?: string | null): Promise<ArtistBioDto> {
    const track = this.requireTrack(trackId);
    return this.resolveForTrack(track, chosenName ?? null, false);
  }

  chooseForTrack(trackId: number, body: ArtistBioChooseDto): Promise<ArtistBioDto> {
    const track = this.requireTrack(trackId);
    const name = body.name?.trim();
    const audiodbId = body.audiodbId?.trim();
    if (!name && !audiodbId) {
      throw new BadRequestException('Provide name or audiodbId');
    }
    if (audiodbId) {
      return this.resolveByAudiodbId(track, audiodbId);
    }
    return this.resolveForTrack(track, name!, true);
  }

  refreshForTrack(trackId: number, chosenName?: string | null): Promise<ArtistBioDto> {
    const track = this.requireTrack(trackId);
    const keys = this.lookupKeysForTrack(track, chosenName ?? preferredArtistName(track));
    for (const key of keys) {
      this.db.raw.prepare(`DELETE FROM artist_bios WHERE lookup_key = ?`).run(key);
    }
    return this.resolveForTrack(track, chosenName ?? null, true);
  }

  async getExtrasForTrack(trackId: number): Promise<ArtistBioDto> {
    const track = this.requireTrack(trackId);
    const base = await this.resolveForTrack(track, null, false);
    if (base.status !== 'ready') {
      return base;
    }
    const row = this.findCachedRow(track);
    if (!row) {
      return base;
    }
    if (row.albums_json != null && row.top_tracks_json != null) {
      return this.rowToDto(row);
    }
    const displayName = row.display_name ?? preferredArtistName(track);
    const mbid = row.musicbrainz_id ?? track.musicbrainz_artist_id;
    const [albums, topTracks] = await Promise.all([
      row.albums_json == null
        ? this.fetchAlbums(displayName, mbid)
        : this.parseAlbums(row.albums_json),
      row.top_tracks_json == null
        ? this.fetchTopTracks(displayName, mbid)
        : this.parseTopTracks(row.top_tracks_json),
    ]);
    const now = Date.now();
    const albumsJson = JSON.stringify(albums);
    const topTracksJson = JSON.stringify(topTracks);
    this.persistExtras(row.lookup_key, albumsJson, topTracksJson, now);
    this.syncExtrasAcrossAliases(row, albumsJson, topTracksJson, now);
    return {
      ...base,
      albums,
      topTracks,
    };
  }

  private async resolveForTrack(
    track: TrackRow,
    chosenName: string | null,
    forceName: boolean,
  ): Promise<ArtistBioDto> {
    const preferred = preferredArtistName(track);
    if (!preferred && !chosenName) {
      return emptyDto('no_artist');
    }

    const cached = this.findCachedRow(track, chosenName);
    if (cached) {
      return this.rowToDto(cached);
    }

    if (!forceName && !chosenName && hasLocalArtistAmbiguity(track)) {
      return {
        status: 'ambiguous',
        displayName: null,
        biography: null,
        genre: null,
        style: null,
        mood: null,
        country: null,
        formedYear: null,
        albums: [],
        topTracks: [],
        choices: localArtistChoices(track).map((name) => ({
          audiodbId: null,
          name,
          country: null,
          genre: null,
          formedYear: null,
        })),
      };
    }

    const lookupName = chosenName ?? preferred!;
    if (!forceName && track.musicbrainz_artist_id) {
      const byMbid = await this.audiodb.lookupArtistByMbid(track.musicbrainz_artist_id);
      if (byMbid) {
        return this.persistArtist(track, byMbid, mbidLookupKey(track.musicbrainz_artist_id));
      }
    }

    for (const variant of searchNameVariants(lookupName)) {
      const artists = (await this.audiodb.searchArtist(variant)) ?? [];
      if (artists.length > 1) {
        return {
          status: 'ambiguous',
          displayName: null,
          biography: null,
          genre: null,
          style: null,
          mood: null,
          country: null,
          formedYear: null,
          albums: [],
          topTracks: [],
          choices: artists.map((artist) => this.toChoice(artist)),
        };
      }
      if (artists.length === 1) {
        return this.persistArtist(track, artists[0]!, nameLookupKey(lookupName));
      }
    }

    return this.persistNotFound(track, lookupName);
  }

  private async resolveByAudiodbId(
    track: TrackRow,
    audiodbId: string,
  ): Promise<ArtistBioDto> {
    const artist = await this.audiodb.lookupArtistById(audiodbId);
    if (!artist) {
      const name = preferredArtistName(track) ?? 'unknown';
      return this.persistNotFound(track, name);
    }
    const name = stringField(artist.strArtist) ?? preferredArtistName(track) ?? 'unknown';
    return this.persistArtist(track, artist, nameLookupKey(name));
  }

  private async persistArtist(
    track: TrackRow,
    artist: AudioDbArtistRecord,
    primaryKey: string,
  ): Promise<ArtistBioDto> {
    const biography = biographyFromArtistRecord(artist as unknown as Record<string, unknown>);
    const row: Omit<ArtistBioRow, 'lookup_key'> = {
      display_name: stringField(artist.strArtist),
      audiodb_id: stringField(artist.idArtist),
      musicbrainz_id:
        stringField(artist.strMusicBrainzID) ?? track.musicbrainz_artist_id,
      status: biography ? 'ready' : 'not_found',
      biography,
      genre: stringField(artist.strGenre),
      style: stringField(artist.strStyle),
      mood: stringField(artist.strMood),
      country: stringField(artist.strCountry),
      formed_year: stringField(artist.intFormedYear),
      albums_json: null,
      top_tracks_json: null,
      fetched_at: Date.now(),
      extras_fetched_at: null,
    };
    this.saveRow(primaryKey, row);
    this.saveAliases(track, row);
    return this.rowToDto({ lookup_key: primaryKey, ...row });
  }

  private persistNotFound(track: TrackRow, lookupName: string): ArtistBioDto {
    const now = Date.now();
    const row: Omit<ArtistBioRow, 'lookup_key'> = {
      display_name: lookupName,
      audiodb_id: null,
      musicbrainz_id: track.musicbrainz_artist_id,
      status: 'not_found',
      biography: null,
      genre: null,
      style: null,
      mood: null,
      country: null,
      formed_year: null,
      albums_json: null,
      top_tracks_json: null,
      fetched_at: now,
      extras_fetched_at: null,
    };
    this.saveRow(nameLookupKey(lookupName), row);
    if (track.musicbrainz_artist_id) {
      this.saveRow(mbidLookupKey(track.musicbrainz_artist_id), row);
    }
    return this.rowToDto({ lookup_key: nameLookupKey(lookupName), ...row });
  }

  private saveAliases(track: TrackRow, row: Omit<ArtistBioRow, 'lookup_key'>): void {
    if (row.display_name) {
      this.saveRow(nameLookupKey(row.display_name), row);
    }
    if (row.musicbrainz_id) {
      this.saveRow(mbidLookupKey(row.musicbrainz_id), row);
    } else if (track.musicbrainz_artist_id) {
      this.saveRow(mbidLookupKey(track.musicbrainz_artist_id), row);
    }
  }

  private saveRow(lookupKey: string, row: Omit<ArtistBioRow, 'lookup_key'>): void {
    this.db.raw
      .prepare(
        `INSERT OR REPLACE INTO artist_bios (
           lookup_key, display_name, audiodb_id, musicbrainz_id, status, biography,
           genre, style, mood, country, formed_year, albums_json, top_tracks_json,
           fetched_at, extras_fetched_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        lookupKey,
        row.display_name,
        row.audiodb_id,
        row.musicbrainz_id,
        row.status,
        row.biography,
        row.genre,
        row.style,
        row.mood,
        row.country,
        row.formed_year,
        row.albums_json,
        row.top_tracks_json,
        row.fetched_at,
        row.extras_fetched_at,
      );
  }

  private persistExtras(
    lookupKey: string,
    albumsJson: string,
    topTracksJson: string,
    now: number,
  ): void {
    this.db.raw
      .prepare(
        `UPDATE artist_bios
         SET albums_json = ?, top_tracks_json = ?, extras_fetched_at = ?
         WHERE lookup_key = ?`,
      )
      .run(albumsJson, topTracksJson, now, lookupKey);
  }

  private syncExtrasAcrossAliases(
    row: ArtistBioRow,
    albumsJson: string,
    topTracksJson: string,
    now: number,
  ): void {
    const keys = new Set<string>();
    if (row.display_name) {
      keys.add(nameLookupKey(row.display_name));
    }
    if (row.musicbrainz_id) {
      keys.add(mbidLookupKey(row.musicbrainz_id));
    }
    for (const key of keys) {
      if (key !== row.lookup_key) {
        this.persistExtras(key, albumsJson, topTracksJson, now);
      }
    }
  }

  private findCachedRow(track: TrackRow, chosenName?: string | null): ArtistBioRow | null {
    const keys = this.lookupKeysForTrack(track, chosenName ?? preferredArtistName(track));
    for (const key of keys) {
      const row = this.db.raw
        .prepare(`SELECT * FROM artist_bios WHERE lookup_key = ?`)
        .get(key) as ArtistBioRow | undefined;
      if (row) {
        return row;
      }
    }
    return null;
  }

  private lookupKeysForTrack(
    track: TrackRow,
    chosenName: string | null,
  ): string[] {
    const keys: string[] = [];
    if (track.musicbrainz_artist_id) {
      keys.push(mbidLookupKey(track.musicbrainz_artist_id));
    }
    if (chosenName) {
      keys.push(nameLookupKey(chosenName));
    }
    const preferred = preferredArtistName(track);
    if (preferred) {
      keys.push(nameLookupKey(preferred));
    }
    return [...new Set(keys)];
  }

  private async fetchAlbums(
    name: string | null,
    mbid: string | null,
  ): Promise<ArtistBioAlbumDto[]> {
    let records: AudioDbDiscographyRecord[] = [];
    if (mbid) {
      records = await this.audiodb.fetchDiscographyByMbid(mbid);
    }
    if (records.length === 0 && name) {
      records = await this.audiodb.fetchDiscographyByName(name);
    }
    return records
      .map((album) => ({
        name: stringField(album.strAlbum) ?? '',
        year: stringField(album.intYearReleased),
      }))
      .filter((album) => album.name);
  }

  private async fetchTopTracks(
    name: string | null,
    mbid: string | null,
  ): Promise<ArtistBioTrackDto[]> {
    let records: AudioDbTopTrackRecord[] = [];
    if (mbid) {
      records = await this.audiodb.fetchTopTracksByMbid(mbid);
    }
    if (records.length === 0 && name) {
      records = await this.audiodb.fetchTopTracksByName(name);
    }
    return records
      .map((track) => ({ name: stringField(track.strTrack) ?? '' }))
      .filter((track) => track.name);
  }

  private parseAlbums(raw: string): ArtistBioAlbumDto[] {
    try {
      const parsed = JSON.parse(raw) as ArtistBioAlbumDto[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private parseTopTracks(raw: string): ArtistBioTrackDto[] {
    try {
      const parsed = JSON.parse(raw) as ArtistBioTrackDto[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private toChoice(artist: AudioDbArtistRecord): ArtistBioChoiceDto {
    return {
      audiodbId: stringField(artist.idArtist),
      name: stringField(artist.strArtist) ?? 'Unknown artist',
      country: stringField(artist.strCountry),
      genre: stringField(artist.strGenre),
      formedYear: stringField(artist.intFormedYear),
    };
  }

  private rowToDto(row: ArtistBioRow): ArtistBioDto {
    if (row.status === 'not_found') {
      return {
        status: 'not_found',
        displayName: row.display_name,
        biography: null,
        genre: null,
        style: null,
        mood: null,
        country: null,
        formedYear: null,
        albums: [],
        topTracks: [],
        choices: [],
      };
    }
    return {
      status: 'ready',
      displayName: row.display_name,
      biography: row.biography,
      genre: row.genre,
      style: row.style,
      mood: row.mood,
      country: row.country,
      formedYear: row.formed_year,
      albums: row.albums_json ? this.parseAlbums(row.albums_json) : [],
      topTracks: row.top_tracks_json ? this.parseTopTracks(row.top_tracks_json) : [],
      choices: [],
    };
  }

  private requireTrack(trackId: number): TrackRow {
    const track = this.library.getTrack(trackId);
    if (!track) {
      throw new NotFoundException('Track not found');
    }
    return track;
  }
}

function emptyDto(status: ArtistBioDto['status']): ArtistBioDto {
  return {
    status,
    displayName: null,
    biography: null,
    genre: null,
    style: null,
    mood: null,
    country: null,
    formedYear: null,
    albums: [],
    topTracks: [],
    choices: [],
  };
}
