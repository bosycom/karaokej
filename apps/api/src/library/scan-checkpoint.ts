export const LIBRARY_SCAN_CHECKPOINT_KEY = 'library_scan_checkpoint';
export const LIBRARY_LAST_FULL_SCAN_AT_KEY = 'library_last_full_scan_at';
export const LIBRARY_SCAN_ISSUES_KEY = 'library_scan_issues';
export const MAX_SCAN_ISSUES = 5000;

export interface ScanCheckpoint {
  root: string;
  completedGroups: string[];
}

export function parseScanCheckpoint(raw: string | null | undefined): ScanCheckpoint | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as ScanCheckpoint;
    if (
      typeof parsed.root !== 'string' ||
      !Array.isArray(parsed.completedGroups) ||
      !parsed.completedGroups.every((entry) => typeof entry === 'string')
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function groupIdForRelativePath(relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, '/');
  const slash = normalized.indexOf('/');
  return slash === -1 ? '.' : normalized.slice(0, slash);
}

export function pathsUnderGroup(
  groupId: string,
  cataloguePaths: Iterable<string>,
): string[] {
  if (groupId === '.') {
    return [...cataloguePaths].filter((path) => !path.includes('/'));
  }
  const prefix = `${groupId}/`;
  return [...cataloguePaths].filter((path) => path.startsWith(prefix));
}

export function seedSeenFromCompletedGroups(
  completedGroups: Iterable<string>,
  cataloguePaths: Iterable<string>,
): Set<string> {
  const seen = new Set<string>();
  for (const groupId of completedGroups) {
    for (const path of pathsUnderGroup(groupId, cataloguePaths)) {
      seen.add(path);
    }
  }
  return seen;
}

export interface CatalogueFingerprint {
  size_bytes: number;
  mtime_ms: number;
}

export function canSkipDirectoryByMtime(
  groupId: string,
  dirMtimeMs: number,
  storedDirMtime: number | undefined,
  existingByPath: Map<string, CatalogueFingerprint>,
): { skip: boolean; seenPaths: string[] } {
  if (storedDirMtime == null || storedDirMtime !== dirMtimeMs) {
    return { skip: false, seenPaths: [] };
  }

  const paths = pathsUnderGroup(groupId, existingByPath.keys());
  if (paths.length === 0) {
    return { skip: false, seenPaths: [] };
  }

  for (const path of paths) {
    const row = existingByPath.get(path);
    if (!row) {
      return { skip: false, seenPaths: [] };
    }
  }

  return { skip: true, seenPaths: paths };
}

export function displayScanPath(libraryRoot: string, fullPath: string): string {
  const normalizedRoot = libraryRoot.replace(/\\/g, '/').replace(/\/+$/, '');
  const normalized = fullPath.replace(/\\/g, '/');
  if (normalized === normalizedRoot) {
    return '.';
  }
  const prefix = `${normalizedRoot}/`;
  if (normalized.startsWith(prefix)) {
    return normalized.slice(prefix.length);
  }
  return fullPath;
}

export function parseScanIssues(raw: string | null | undefined): Array<{
  path: string;
  op: 'readdir' | 'stat' | 'exists' | 'parse';
  message: string;
}> {
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    const issues: Array<{
      path: string;
      op: 'readdir' | 'stat' | 'exists' | 'parse';
      message: string;
    }> = [];
    for (const entry of parsed) {
      if (
        entry &&
        typeof entry === 'object' &&
        typeof entry.path === 'string' &&
        (entry.op === 'readdir' ||
          entry.op === 'stat' ||
          entry.op === 'exists' ||
          entry.op === 'parse') &&
        typeof entry.message === 'string'
      ) {
        issues.push({
          path: entry.path,
          op: entry.op,
          message: entry.message,
        });
      }
    }
    return issues;
  } catch {
    return [];
  }
}
