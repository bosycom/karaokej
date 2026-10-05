import { parseTagName } from '@karaokej/shared';

interface RunSql {
  prepare(sql: string): {
    run(...params: unknown[]): unknown;
    get(...params: unknown[]): unknown;
  };
}

interface Sql extends RunSql {
  prepare(sql: string): {
    run(...params: unknown[]): unknown;
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown;
  };
}

const CHUNK = 400;

export function loadManagedTagNames(
  db: Sql,
  trackIds: number[],
): Map<number, string[]> {
  const map = new Map<number, string[]>();
  for (let offset = 0; offset < trackIds.length; offset += CHUNK) {
    const chunk = trackIds.slice(offset, offset + CHUNK);
    const placeholders = chunk.map(() => '?').join(', ');
    const rows = db
      .prepare(
        `SELECT ttn.track_id AS track_id, mt.name AS name
         FROM track_tag_names ttn
         JOIN managed_tags mt ON mt.name_key = ttn.name_key
         WHERE ttn.track_id IN (${placeholders})
         ORDER BY mt.name COLLATE NOCASE`,
      )
      .all(...chunk) as Array<{ track_id: number; name: string }>;
    for (const row of rows) {
      const list = map.get(row.track_id) ?? [];
      list.push(row.name);
      map.set(row.track_id, list);
    }
  }
  return map;
}

export function managedTagsForTrack(db: Sql, trackId: number): string[] {
  return loadManagedTagNames(db, [trackId]).get(trackId) ?? [];
}

export function replaceTrackMoodCache(
  db: RunSql,
  trackId: number,
  validNames: string[],
  extra: string[],
): void {
  db.prepare(`DELETE FROM track_tag_names WHERE track_id = ?`).run(trackId);
  const insert = db.prepare(
    `INSERT INTO track_tag_names (track_id, name_key, name) VALUES (?, ?, ?)`,
  );
  const seen = new Set<string>();
  for (const raw of validNames) {
    const parsed = parseTagName(raw);
    if (!parsed || seen.has(parsed.key)) {
      continue;
    }
    seen.add(parsed.key);
    insert.run(trackId, parsed.key, parsed.name);
  }
  db.prepare(`UPDATE tracks SET mood_extra = ? WHERE id = ?`).run(
    extra.length > 0 ? JSON.stringify(extra) : null,
    trackId,
  );
}

export function clearTrackMoodCache(db: RunSql, trackId: number): void {
  db.prepare(`DELETE FROM track_tag_names WHERE track_id = ?`).run(trackId);
  db.prepare(`UPDATE tracks SET mood_extra = NULL WHERE id = ?`).run(trackId);
}

export function readMoodExtra(raw: string | null | undefined): string[] {
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((item): item is string => typeof item === 'string' && item.length > 0);
  } catch {
    return [];
  }
}
