import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { COVER_SIZES, type CoverFormat, type CoverSize } from './cover-thumbnails';

interface DbLike {
  prepare(sql: string): {
    run(...params: unknown[]): unknown;
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  };
}

export function coverFilePath(
  cacheRoot: string,
  hash: string,
  size: CoverSize,
  format: CoverFormat,
): string {
  return join(
    cacheRoot,
    hash.slice(0, 2),
    `${hash}-${COVER_SIZES[size]}.${format}`,
  );
}

export function writeCoverFile(
  cacheRoot: string,
  hash: string,
  size: CoverSize,
  format: CoverFormat,
  data: Buffer,
): string {
  const target = coverFilePath(cacheRoot, hash, size, format);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, data);
  return target;
}

export function removeCoverFiles(
  cacheRoot: string,
  hash: string,
  format: CoverFormat,
): void {
  for (const size of Object.keys(COVER_SIZES) as CoverSize[]) {
    rmSync(coverFilePath(cacheRoot, hash, size, format), { force: true });
  }
}

/**
 * Thumbnails are shared by every group pointing at the same image, so files are
 * only removed once the last referencing group is gone.
 */
export function pruneUnreferencedCover(
  db: DbLike,
  cacheRoot: string,
  hash: string | null,
): boolean {
  if (!hash) {
    return false;
  }
  const referencing = db
    .prepare(`SELECT COUNT(*) AS n FROM cover_groups WHERE cover_hash = ?`)
    .get(hash) as { n: number };
  if (referencing.n > 0) {
    return false;
  }
  const row = db
    .prepare(`SELECT format FROM covers WHERE hash = ?`)
    .get(hash) as { format: CoverFormat } | undefined;
  removeCoverFiles(cacheRoot, hash, row?.format ?? 'webp');
  db.prepare(`DELETE FROM covers WHERE hash = ?`).run(hash);
  return true;
}

/** Drops group rows that no track references any more, then their thumbnails. */
export function pruneOrphanedCoverGroups(
  db: DbLike,
  cacheRoot: string,
  groupKeys: Iterable<string>,
): void {
  for (const groupKey of groupKeys) {
    if (!groupKey) {
      continue;
    }
    const inUse = db
      .prepare(`SELECT COUNT(*) AS n FROM tracks WHERE cover_group = ?`)
      .get(groupKey) as { n: number };
    if (inUse.n > 0) {
      continue;
    }
    const group = db
      .prepare(`SELECT cover_hash FROM cover_groups WHERE group_key = ?`)
      .get(groupKey) as { cover_hash: string | null } | undefined;
    db.prepare(`DELETE FROM cover_groups WHERE group_key = ?`).run(groupKey);
    pruneUnreferencedCover(db, cacheRoot, group?.cover_hash ?? null);
  }
}
