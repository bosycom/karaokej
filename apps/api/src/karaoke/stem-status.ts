import { AiProcessingStatus } from '@karaokej/shared';
import { KaraokeStemRow, TrackRow } from '../db/types';

export interface StemDbReader {
  prepare(sql: string): {
    all(...params: unknown[]): unknown[];
  };
}

export function loadStemRowsForTracks(
  db: StemDbReader,
  trackIds: number[],
): Map<number, KaraokeStemRow> {
  const map = new Map<number, KaraokeStemRow>();
  if (trackIds.length === 0) {
    return map;
  }
  const placeholders = trackIds.map(() => '?').join(',');
  const rows = db
    .prepare(`SELECT * FROM karaoke_stems WHERE track_id IN (${placeholders})`)
    .all(...trackIds) as KaraokeStemRow[];
  for (const row of rows) {
    map.set(row.track_id, row);
  }
  return map;
}

export function resolveStemStatusForTrack(
  track: Pick<TrackRow, 'mtime_ms' | 'size_bytes'>,
  stemRow: KaraokeStemRow | undefined,
): AiProcessingStatus | null {
  if (!stemRow) {
    return null;
  }
  const fresh =
    stemRow.source_mtime_ms === track.mtime_ms &&
    stemRow.source_size_bytes === track.size_bytes;
  if (!fresh && (stemRow.status === 'ready' || stemRow.status === 'processing')) {
    return 'pending';
  }
  return stemRow.status;
}

export function resolveQueueStemStatus(
  track: Pick<TrackRow, 'mtime_ms' | 'size_bytes'>,
  stemRow: KaraokeStemRow | undefined,
): { status: AiProcessingStatus } | null {
  const status = resolveStemStatusForTrack(track, stemRow);
  if (!status) {
    return null;
  }
  return { status };
}
