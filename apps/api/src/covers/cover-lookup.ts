import { CoverStatus } from '@karaokej/shared';
import { CoverGroupRow, TrackRow } from '../db/types';

export interface CoverDbReader {
  prepare(sql: string): {
    all(...params: unknown[]): unknown[];
  };
}

export interface CoverInfo {
  status: CoverStatus;
  hash: string | null;
}

export function loadCoverInfoForTracks(
  db: CoverDbReader,
  rows: Array<Pick<TrackRow, 'cover_group'>>,
): Map<string, CoverInfo> {
  const map = new Map<string, CoverInfo>();
  const keys = [
    ...new Set(
      rows
        .map((row) => row.cover_group)
        .filter((key): key is string => Boolean(key)),
    ),
  ];
  if (keys.length === 0) {
    return map;
  }
  const placeholders = keys.map(() => '?').join(',');
  const groups = db
    .prepare(
      `SELECT group_key, status, cover_hash FROM cover_groups WHERE group_key IN (${placeholders})`,
    )
    .all(...keys) as Array<Pick<CoverGroupRow, 'group_key' | 'status' | 'cover_hash'>>;
  for (const group of groups) {
    map.set(group.group_key, {
      status: group.status,
      hash: group.cover_hash,
    });
  }
  return map;
}

export function coverInfoForTrack(
  map: Map<string, CoverInfo>,
  row: Pick<TrackRow, 'cover_group'>,
): CoverInfo | null {
  if (!row.cover_group) {
    return null;
  }
  return map.get(row.cover_group) ?? null;
}

export function loadCoverInfoForTrack(
  db: CoverDbReader,
  row: Pick<TrackRow, 'cover_group'>,
): CoverInfo | null {
  return coverInfoForTrack(loadCoverInfoForTracks(db, [row]), row);
}
