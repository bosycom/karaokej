import { resolve } from 'node:path';

export function normalizeScanRoot(path: string): string {
  return resolve(path);
}

/** Relative path from parent to child when child is under parent; otherwise null. */
export function nestingRelative(parent: string, child: string): string | null {
  const normalizedParent = normalizeScanRoot(parent);
  const normalizedChild = normalizeScanRoot(child);
  if (normalizedParent === normalizedChild) {
    return '';
  }
  const prefix = `${normalizedParent}/`;
  if (!normalizedChild.startsWith(prefix)) {
    return null;
  }
  return normalizedChild.slice(prefix.length);
}

export type RootChange =
  | { kind: 'same' }
  | { kind: 'unknown' }
  | { kind: 'unrelated' }
  | { kind: 'expanded'; prefix: string }
  | { kind: 'narrowed'; stripPrefix: string };

export function detectRootChange(
  storedRoot: string | null,
  newRoot: string,
): RootChange {
  if (!storedRoot) {
    return { kind: 'unknown' };
  }
  const stored = normalizeScanRoot(storedRoot);
  const next = normalizeScanRoot(newRoot);
  if (stored === next) {
    return { kind: 'same' };
  }
  const storedUnderNext = nestingRelative(next, stored);
  if (storedUnderNext !== null) {
    return { kind: 'expanded', prefix: storedUnderNext };
  }
  const nextUnderStored = nestingRelative(stored, next);
  if (nextUnderStored !== null) {
    return { kind: 'narrowed', stripPrefix: nextUnderStored };
  }
  return { kind: 'unrelated' };
}

function normalizeRelativePath(path: string): string {
  return path.replace(/\\/g, '/');
}

export function prefixRelativePath(prefix: string, path: string): string {
  const normalizedPrefix = normalizeRelativePath(prefix).replace(/\/+$/, '');
  if (!normalizedPrefix) {
    return normalizeRelativePath(path);
  }
  const normalizedPath = normalizeRelativePath(path);
  return `${normalizedPrefix}/${normalizedPath}`;
}

/** Strip prefix from path when it matches; otherwise null. */
export function stripRelativePath(prefix: string, path: string): string | null {
  const normalizedPrefix = normalizeRelativePath(prefix).replace(/\/+$/, '');
  const normalizedPath = normalizeRelativePath(path);
  const needle = `${normalizedPrefix}/`;
  if (!normalizedPath.startsWith(needle)) {
    return null;
  }
  return normalizedPath.slice(needle.length);
}

export interface PathRebaseRow {
  id: number;
  relative_path: string;
}

export interface PathRebasePlan {
  updates: Array<{ id: number; relative_path: string }>;
}

function normalizedPrefix(prefix: string): string {
  return normalizeRelativePath(prefix).replace(/\/+$/, '');
}

function rowAlreadyRebased(
  row: PathRebaseRow,
  change: Extract<RootChange, { kind: 'expanded' | 'narrowed' }>,
): boolean {
  const path = normalizeRelativePath(row.relative_path);
  if (change.kind === 'expanded') {
    const prefix = normalizedPrefix(change.prefix);
    if (!prefix) {
      return true;
    }
    return path.startsWith(`${prefix}/`);
  }
  const prefix = normalizedPrefix(change.stripPrefix);
  if (!prefix) {
    return true;
  }
  return !path.startsWith(`${prefix}/`);
}

/** Build id -> new relative_path updates for an expanded or narrowed root change. */
export function planPathRebase(
  rows: PathRebaseRow[],
  change: Extract<RootChange, { kind: 'expanded' | 'narrowed' }>,
): PathRebasePlan | null {
  const updates: Array<{ id: number; relative_path: string }> = [];
  const targets = new Set<string>();

  if (change.kind === 'expanded') {
    for (const row of rows) {
      if (rowAlreadyRebased(row, change)) {
        continue;
      }
      const nextPath = prefixRelativePath(change.prefix, row.relative_path);
      if (targets.has(nextPath)) {
        return null;
      }
      targets.add(nextPath);
      updates.push({ id: row.id, relative_path: nextPath });
    }
    return { updates };
  }

  for (const row of rows) {
    if (rowAlreadyRebased(row, change)) {
      continue;
    }
    const nextPath = stripRelativePath(change.stripPrefix, row.relative_path);
    if (nextPath == null) {
      continue;
    }
    if (targets.has(nextPath)) {
      return null;
    }
    targets.add(nextPath);
    updates.push({ id: row.id, relative_path: nextPath });
  }
  return { updates };
}

/** Final relative_path values after applying a rebase plan (including unchanged rows). */
export function projectedPathsAfterRebase(
  rows: PathRebaseRow[],
  plan: PathRebasePlan,
): Map<number, string> {
  const updated = new Map(plan.updates.map((row) => [row.id, row.relative_path]));
  const projected = new Map<number, string>();
  for (const row of rows) {
    projected.set(row.id, updated.get(row.id) ?? row.relative_path);
  }
  return projected;
}

/** Detect target-path collisions with rows that are not being updated. */
export function hasPathRebaseConflicts(
  rows: PathRebaseRow[],
  plan: PathRebasePlan,
): boolean {
  const updatedIds = new Set(plan.updates.map((row) => row.id));
  const targetPaths = new Set(plan.updates.map((row) => row.relative_path));
  for (const row of rows) {
    if (updatedIds.has(row.id)) {
      continue;
    }
    if (targetPaths.has(row.relative_path)) {
      return true;
    }
  }
  return false;
}
