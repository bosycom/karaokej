import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PlaylistDetailDto,
  PlaylistItemDto,
  PlaylistQueueMode,
  PlaylistSummaryDto,
  QueueItemDto,
} from '@karaokej/shared';
import { DbService } from '../db/db.service';
import { PlaylistItemRow, PlaylistRow, TrackRow, trackToDto } from '../db/types';
import { coverInfoForTrack, loadCoverInfoForTracks } from '../covers/cover-lookup';
import { QueueService } from '../queue/queue.service';

@Injectable()
export class PlaylistsService {
  constructor(
    private readonly db: DbService,
    private readonly queue: QueueService,
  ) {}

  list(): PlaylistSummaryDto[] {
    const rows = this.db.raw
      .prepare(
        `SELECT p.id, p.name, p.description, p.created_at, p.updated_at,
                COUNT(pi.id) AS item_count
         FROM playlists p
         LEFT JOIN playlist_items pi ON pi.playlist_id = p.id
         GROUP BY p.id
         ORDER BY p.name COLLATE NOCASE, p.id`,
      )
      .all() as Array<
      PlaylistRow & { item_count: number }
    >;
    return rows.map((row) => this.summaryToDto(row, row.item_count));
  }

  get(id: number): PlaylistDetailDto {
    const playlist = this.getPlaylistRow(id);
    return {
      ...this.playlistMetaToDto(playlist),
      items: this.getItems(id),
    };
  }

  create(body: { name?: string; description?: string | null }): PlaylistDetailDto {
    const name = body.name?.trim();
    if (!name) {
      throw new BadRequestException('Playlist name is required');
    }
    const now = Date.now();
    const description = this.normalizeDescription(body.description);
    const result = this.db.raw
      .prepare(
        `INSERT INTO playlists (name, description, created_at, updated_at)
         VALUES (?, ?, ?, ?)`,
      )
      .run(name, description, now, now);
    const id = Number((result as { lastInsertRowid: bigint }).lastInsertRowid);
    return this.get(id);
  }

  update(
    id: number,
    body: { name?: string; description?: string | null },
  ): PlaylistDetailDto {
    const playlist = this.getPlaylistRow(id);
    const name =
      body.name === undefined ? playlist.name : body.name.trim();
    if (!name) {
      throw new BadRequestException('Playlist name is required');
    }
    const description =
      body.description === undefined
        ? playlist.description
        : this.normalizeDescription(body.description);
    const now = Date.now();
    this.db.raw
      .prepare(
        `UPDATE playlists SET name = ?, description = ?, updated_at = ? WHERE id = ?`,
      )
      .run(name, description, now, id);
    return this.get(id);
  }

  delete(id: number): void {
    this.getPlaylistRow(id);
    this.db.raw.prepare(`DELETE FROM playlists WHERE id = ?`).run(id);
  }

  addItem(playlistId: number, trackId: number): PlaylistDetailDto {
    this.getPlaylistRow(playlistId);
    const track = this.db.raw
      .prepare(`SELECT id FROM tracks WHERE id = ?`)
      .get(trackId) as { id: number } | undefined;
    if (!track) {
      throw new NotFoundException('Track not found');
    }
    const max = this.db.raw
      .prepare(
        `SELECT COALESCE(MAX(position), 0) AS n FROM playlist_items WHERE playlist_id = ?`,
      )
      .get(playlistId) as { n: number };
    const now = Date.now();
    this.db.raw
      .prepare(
        `INSERT INTO playlist_items (playlist_id, track_id, position, added_at)
         VALUES (?, ?, ?, ?)`,
      )
      .run(playlistId, trackId, max.n + 1, now);
    this.touchPlaylist(playlistId, now);
    return this.get(playlistId);
  }

  removeItem(playlistId: number, itemId: number): PlaylistDetailDto {
    this.getPlaylistRow(playlistId);
    const item = this.db.raw
      .prepare(
        `SELECT id FROM playlist_items WHERE id = ? AND playlist_id = ?`,
      )
      .get(itemId, playlistId) as { id: number } | undefined;
    if (!item) {
      throw new NotFoundException('Playlist item not found');
    }
    this.db.raw.prepare(`DELETE FROM playlist_items WHERE id = ?`).run(itemId);
    this.reindexItems(playlistId);
    this.touchPlaylist(playlistId);
    return this.get(playlistId);
  }

  reorderItems(playlistId: number, ids: number[]): PlaylistDetailDto {
    this.getPlaylistRow(playlistId);
    const existing = this.db.raw
      .prepare(
        `SELECT id FROM playlist_items WHERE playlist_id = ? ORDER BY position ASC, id ASC`,
      )
      .all(playlistId) as Array<{ id: number }>;
    const existingSet = new Set(existing.map((row) => row.id));
    if (
      ids.length !== existing.length ||
      ids.some((id) => !existingSet.has(id))
    ) {
      throw new NotFoundException(
        'Playlist reorder payload does not match current items',
      );
    }
    const update = this.db.raw.prepare(
      `UPDATE playlist_items SET position = ? WHERE id = ? AND playlist_id = ?`,
    );
    const tx = this.db.raw.transaction(() => {
      ids.forEach((id, index) => update.run(index + 1, id, playlistId));
    });
    tx();
    this.touchPlaylist(playlistId);
    return this.get(playlistId);
  }

  loadIntoQueue(
    playlistId: number,
    mode: PlaylistQueueMode,
  ): QueueItemDto[] {
    this.getPlaylistRow(playlistId);
    const trackIds = this.db.raw
      .prepare(
        `SELECT pi.track_id
         FROM playlist_items pi
         JOIN tracks t ON t.id = pi.track_id
         WHERE pi.playlist_id = ? AND t.available = 1
         ORDER BY pi.position ASC, pi.id ASC`,
      )
      .all(playlistId) as Array<{ track_id: number }>;
    const ids = trackIds.map((row) => row.track_id);
    if (mode === 'replace') {
      return this.queue.replaceWithTracks(ids, true);
    }
    return this.queue.appendTracks(ids, true);
  }

  private getPlaylistRow(id: number): PlaylistRow {
    const row = this.db.raw
      .prepare(`SELECT * FROM playlists WHERE id = ?`)
      .get(id) as PlaylistRow | undefined;
    if (!row) {
      throw new NotFoundException('Playlist not found');
    }
    return row;
  }

  private getItems(playlistId: number): PlaylistItemDto[] {
    const rows = this.db.raw
      .prepare(
        `SELECT
           pi.id AS item_id,
           pi.position AS item_position,
           pi.added_at AS item_added_at,
           t.*
         FROM playlist_items pi
         JOIN tracks t ON t.id = pi.track_id
         WHERE pi.playlist_id = ?
         ORDER BY pi.position ASC, pi.id ASC`,
      )
      .all(playlistId) as Array<
      TrackRow & {
        item_id: number;
        item_position: number;
        item_added_at: number;
      }
    >;

    const coverByGroup = loadCoverInfoForTracks(this.db.raw, rows);

    return rows.map((row) => ({
      id: row.item_id,
      position: row.item_position,
      addedAt: new Date(row.item_added_at).toISOString(),
      available: row.available === 1,
      track: trackToDto(row, null, coverInfoForTrack(coverByGroup, row)),
    }));
  }

  private reindexItems(playlistId: number): void {
    const items = this.db.raw
      .prepare(
        `SELECT id FROM playlist_items WHERE playlist_id = ? ORDER BY position ASC, id ASC`,
      )
      .all(playlistId) as PlaylistItemRow[];
    const update = this.db.raw.prepare(
      `UPDATE playlist_items SET position = ? WHERE id = ?`,
    );
    const tx = this.db.raw.transaction(() => {
      items.forEach((item, index) => update.run(index + 1, item.id));
    });
    tx();
  }

  private touchPlaylist(playlistId: number, updatedAt = Date.now()): void {
    this.db.raw
      .prepare(`UPDATE playlists SET updated_at = ? WHERE id = ?`)
      .run(updatedAt, playlistId);
  }

  private summaryToDto(row: PlaylistRow, itemCount: number): PlaylistSummaryDto {
    return {
      ...this.playlistMetaToDto(row),
      itemCount,
    };
  }

  private playlistMetaToDto(row: PlaylistRow): Omit<PlaylistSummaryDto, 'itemCount'> {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  private normalizeDescription(value: string | null | undefined): string | null {
    if (value == null) {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
}
