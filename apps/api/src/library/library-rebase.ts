import {
  detectRootChange,
  hasPathRebaseConflicts,
  planPathRebase,
  type PathRebaseRow,
} from './scan-root';
import {
  buildLibraryPathLayout,
  parseStoredScanRoots,
  prefixCataloguePath,
  sameRootSet,
  serializeStoredScanRoots,
  stripCataloguePath,
} from './library-paths';

export interface PathUpdate {
  id: number;
  relative_path: string;
}

export function planKeyPrefixUpdates(
  rows: PathRebaseRow[],
  key: string,
  keys: Set<string>,
): PathUpdate[] | null {
  const updates: PathUpdate[] = [];
  const targets = new Set<string>();

  for (const row of rows) {
    const normalized = row.relative_path.replace(/\\/g, '/');
    const firstSegment = normalized.split('/')[0] ?? '';
    if (keys.has(firstSegment)) {
      continue;
    }
    const nextPath = prefixCataloguePath(key, normalized, true);
    if (targets.has(nextPath)) {
      return null;
    }
    targets.add(nextPath);
    updates.push({ id: row.id, relative_path: nextPath });
  }

  return updates;
}

export function planKeyStripUpdates(
  rows: PathRebaseRow[],
  key: string,
): PathUpdate[] | null {
  const updates: PathUpdate[] = [];
  const targets = new Set<string>();

  for (const row of rows) {
    const stripped = stripCataloguePath(key, row.relative_path);
    if (stripped == null) {
      continue;
    }
    if (targets.has(stripped)) {
      return null;
    }
    targets.add(stripped);
    updates.push({ id: row.id, relative_path: stripped });
  }

  return updates;
}

export function hasPathUpdateConflicts(
  rows: PathRebaseRow[],
  updates: PathUpdate[],
): boolean {
  const updatedIds = new Set(updates.map((row) => row.id));
  const targetPaths = new Set(updates.map((row) => row.relative_path));
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

export interface MultiRootRebasePlan {
  pathUpdates: PathUpdate[];
  storedRootsAfter: string[];
  clearCheckpoint: boolean;
  logMessage?: string;
  warnMessage?: string;
}

export function planMultiRootRebase(
  storedRoots: string[] | null,
  newRoots: string[],
  rows: PathRebaseRow[],
): MultiRootRebasePlan | null {
  if (!storedRoots) {
    return rows.length > 0
      ? {
          pathUpdates: [],
          storedRootsAfter: newRoots,
          clearCheckpoint: false,
          logMessage: 'Recorded library scan roots for existing catalogue',
        }
      : null;
  }

  if (sameRootSet(storedRoots, newRoots)) {
    return { pathUpdates: [], storedRootsAfter: newRoots, clearCheckpoint: false };
  }

  const newLayout = buildLibraryPathLayout(newRoots);
  const allKeys = new Set([...newLayout.keys.values()]);

  if (storedRoots.length === 1 && newRoots.length === 1) {
    const change = detectRootChange(storedRoots[0]!, newRoots[0]!);
    if (change.kind === 'unrelated') {
      return {
        pathUpdates: [],
        storedRootsAfter: newRoots,
        clearCheckpoint: true,
        warnMessage: `Library path changed to an unrelated folder (${storedRoots[0]} -> ${newRoots[0]}); catalogue paths will not be rebased`,
      };
    }
    if (change.kind === 'same' || change.kind === 'unknown') {
      return {
        pathUpdates: [],
        storedRootsAfter: newRoots,
        clearCheckpoint: false,
      };
    }
    const plan = planPathRebase(rows, change);
    if (!plan || hasPathRebaseConflicts(rows, plan)) {
      return {
        pathUpdates: [],
        storedRootsAfter: newRoots,
        clearCheckpoint: false,
        warnMessage: `Could not rebase catalogue paths for root change (${storedRoots[0]} -> ${newRoots[0]}); falling back to full re-index`,
      };
    }
    return {
      pathUpdates: plan.updates,
      storedRootsAfter: newRoots,
      clearCheckpoint: false,
    };
  }

  if (storedRoots.length === 1 && newRoots.length > 1) {
    const stored = storedRoots[0]!;
    const matchingRoot = newRoots.find((root) => root === stored);
    if (matchingRoot) {
      const key = newLayout.keys.get(matchingRoot)!;
      const prefixUpdates = planKeyPrefixUpdates(rows, key, allKeys);
      if (!prefixUpdates || hasPathUpdateConflicts(rows, prefixUpdates)) {
        return {
          pathUpdates: [],
          storedRootsAfter: newRoots,
          clearCheckpoint: false,
          warnMessage: 'Could not prefix catalogue paths for multi-library setup',
        };
      }
      return {
        pathUpdates: prefixUpdates,
        storedRootsAfter: newRoots,
        clearCheckpoint: false,
        logMessage: `Prefixed ${prefixUpdates.length} catalogue path(s) for multi-library setup`,
      };
    }

    for (const newRoot of newRoots) {
      const change = detectRootChange(stored, newRoot);
      if (change.kind === 'narrowed' || change.kind === 'expanded') {
        const rebasePlan = planPathRebase(rows, change);
        if (!rebasePlan || hasPathRebaseConflicts(rows, rebasePlan)) {
          return {
            pathUpdates: [],
            storedRootsAfter: newRoots,
            clearCheckpoint: false,
            warnMessage: `Could not rebase catalogue paths (${stored} -> ${newRoot}) for multi-library setup`,
          };
        }
        const key = newLayout.keys.get(newRoot)!;
        const projectedRows = rows.map((row) => {
          const update = rebasePlan.updates.find((entry) => entry.id === row.id);
          return {
            id: row.id,
            relative_path: update?.relative_path ?? row.relative_path,
          };
        });
        const prefixUpdates = planKeyPrefixUpdates(projectedRows, key, allKeys);
        if (!prefixUpdates || hasPathUpdateConflicts(projectedRows, prefixUpdates)) {
          return {
            pathUpdates: [],
            storedRootsAfter: newRoots,
            clearCheckpoint: false,
            warnMessage: 'Could not prefix catalogue paths after root rebase',
          };
        }
        const combined = [...rebasePlan.updates];
        for (const prefixUpdate of prefixUpdates) {
          if (!combined.some((entry) => entry.id === prefixUpdate.id)) {
            combined.push(prefixUpdate);
          } else {
            const existing = combined.find((entry) => entry.id === prefixUpdate.id);
            if (existing) {
              existing.relative_path = prefixUpdate.relative_path;
            }
          }
        }
        return {
          pathUpdates: combined,
          storedRootsAfter: newRoots,
          clearCheckpoint: false,
          logMessage: `Rebased and prefixed catalogue paths for multi-library setup (${stored} -> ${newRoot})`,
        };
      }
    }

    return {
      pathUpdates: [],
      storedRootsAfter: newRoots,
      clearCheckpoint: true,
      warnMessage: `Library paths changed unrelatedly (${stored} -> ${newRoots.join(', ')}); catalogue paths will not be rebased`,
    };
  }

  if (storedRoots.length > 1 && newRoots.length === 1) {
    const remaining = newRoots[0]!;
    if (!storedRoots.includes(remaining)) {
      return {
        pathUpdates: [],
        storedRootsAfter: newRoots,
        clearCheckpoint: true,
        warnMessage: `Library paths changed unrelatedly (${storedRoots.join(', ')} -> ${remaining}); catalogue paths will not be rebased`,
      };
    }

    const key = newLayout.keys.get(remaining)!;
    const stripUpdates = planKeyStripUpdates(rows, key);
    if (!stripUpdates || hasPathUpdateConflicts(rows, stripUpdates)) {
      return {
        pathUpdates: [],
        storedRootsAfter: newRoots,
        clearCheckpoint: false,
        warnMessage: 'Could not strip library key prefix when reducing to a single root',
      };
    }

    return {
      pathUpdates: stripUpdates,
      storedRootsAfter: newRoots,
      clearCheckpoint: false,
      logMessage: `Stripped ${stripUpdates.length} catalogue path prefix(es) for single-library setup`,
    };
  }

  const overlap = storedRoots.filter((root) => newRoots.includes(root));
  if (overlap.length === 0) {
    return {
      pathUpdates: [],
      storedRootsAfter: newRoots,
      clearCheckpoint: true,
      warnMessage: `Library paths changed unrelatedly; catalogue paths will not be rebased`,
    };
  }

  return {
    pathUpdates: [],
    storedRootsAfter: newRoots,
    clearCheckpoint: false,
  };
}

export { parseStoredScanRoots, serializeStoredScanRoots };
