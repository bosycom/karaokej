import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import WebSocket from 'ws';
import {
  JobStatusDto,
  PlaybackStateDto,
  QueueItemDto,
  SessionStateDto,
  WsClientMessage,
} from '@karaokej/shared';
import { DbService } from '../db/db.service';
import { JobRow, PlaybackRow, TrackRow, trackToDto } from '../db/types';

@Injectable()
export class SessionService implements OnModuleDestroy {
  private readonly logger = new Logger(SessionService.name);
  private readonly clients = new Set<WebSocket>();

  constructor(private readonly db: DbService) {}

  onModuleDestroy(): void {
    for (const client of this.clients) {
      try {
        client.close();
      } catch {
        /* ignore */
      }
    }
    this.clients.clear();
  }

  addClient(socket: WebSocket): void {
    this.clients.add(socket);
    socket.on('close', () => this.clients.delete(socket));
    socket.on('error', () => this.clients.delete(socket));
    this.send(socket, this.getState());
  }

  handleMessage(socket: WebSocket, raw: string): void {
    try {
      const msg = JSON.parse(raw) as WsClientMessage;
      if (msg.type === 'hello' && msg.clientId) {
        this.claimPlayerIfNeeded(msg.clientId);
        this.send(socket, this.getState());
      }
    } catch (err) {
      this.logger.warn(`Bad WS message: ${err}`);
    }
  }

  broadcast(): void {
    const state = this.getState();
    for (const client of this.clients) {
      this.send(client, state);
    }
  }

  getState(): SessionStateDto {
    return {
      playback: this.getPlayback(),
      queue: this.getQueue(),
      jobs: {
        scan: this.job('scan'),
        lyricsFetch: this.job('lyrics'),
      },
    };
  }

  getPlayback(): PlaybackStateDto {
    const row = this.db.raw
      .prepare(`SELECT * FROM playback_state WHERE id = 1`)
      .get() as PlaybackRow;
    let currentTrack = null;
    if (row.current_queue_item_id) {
      const joined = this.db.raw
        .prepare(
          `SELECT t.* FROM queue_items q JOIN tracks t ON t.id = q.track_id WHERE q.id = ?`,
        )
        .get(row.current_queue_item_id) as TrackRow | undefined;
      currentTrack = joined ? trackToDto(joined) : null;
    }
    return {
      currentQueueItemId: row.current_queue_item_id,
      currentTrack,
      status: row.status,
      positionMs: row.position_ms,
      volume: row.volume,
      playerClientId: row.player_client_id,
      seekSeq: row.seek_seq,
    };
  }

  getQueue(): QueueItemDto[] {
    const rows = this.db.raw
      .prepare(
        `SELECT
           q.id AS queue_id,
           q.position AS queue_position,
           q.added_at,
           t.id, t.relative_path, t.format, t.size_bytes, t.mtime_ms,
           t.title, t.artist, t.album, t.album_artist, t.track_no, t.duration_ms,
           t.lyric_status, t.lyric_source, t.lyric_checked_at, t.lrclib_id,
           t.fingerprint, t.created_at, t.updated_at
         FROM queue_items q
         JOIN tracks t ON t.id = q.track_id
         ORDER BY q.position ASC, q.id ASC`,
      )
      .all() as Array<
      TrackRow & { queue_id: number; queue_position: number; added_at: number }
    >;

    return rows.map((row) => ({
      id: row.queue_id,
      position: row.queue_position,
      addedAt: new Date(row.added_at).toISOString(),
      track: trackToDto(row),
    }));
  }

  claimPlayer(clientId: string): void {
    this.db.raw
      .prepare(
        `UPDATE playback_state SET player_client_id = ?, updated_at = ? WHERE id = 1`,
      )
      .run(clientId, Date.now());
    this.broadcast();
  }

  private claimPlayerIfNeeded(clientId: string): void {
    const row = this.db.raw
      .prepare(`SELECT player_client_id FROM playback_state WHERE id = 1`)
      .get() as { player_client_id: string | null };
    if (!row.player_client_id) {
      this.claimPlayer(clientId);
    }
  }

  private job(kind: 'scan' | 'lyrics'): JobStatusDto {
    const row = this.db.raw
      .prepare(`SELECT * FROM jobs WHERE kind = ?`)
      .get(kind) as JobRow | undefined;
    return {
      kind,
      running: Boolean(row?.running),
      current: row?.current ?? 0,
      total: row?.total ?? 0,
      message: row?.message ?? null,
    };
  }

  private send(socket: WebSocket, state: SessionStateDto): void {
    if (socket.readyState !== WebSocket.OPEN) {
      return;
    }
    try {
      socket.send(JSON.stringify({ type: 'session', state }));
    } catch {
      this.clients.delete(socket);
    }
  }
}
