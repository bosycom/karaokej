import { readdir, stat } from 'node:fs/promises';
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { basename, extname, join, relative } from 'node:path';
import {
  AUDIO_EXTENSIONS,
  ExistingTrackFingerprint,
  isJunkDir,
  isUnchangedFile,
  WalkedFile,
} from './fs-utils';
import { withFsOp } from './fs-timeout';
import { canSkipDirectoryByMtime } from './scan-checkpoint';
import type { WalkErrorReport } from './scan-ipc';

export interface TopLevelFolderProgress {
  label: string;
  groupId: string;
  index: number;
  total: number;
  resuming?: boolean;
}

export interface WalkAudioFileChunksOptions {
  shouldAbort?: () => boolean;
  chunkSize?: number;
  fsTimeoutMs?: number;
  onTopLevelFolder?: (progress: TopLevelFolderProgress) => void;
  onWalkError?: (error: WalkErrorReport) => void;
  completedGroups?: Set<string>;
  skipUnchangedDirs?: boolean;
  dirMtimes?: Map<string, number>;
  onDirStat?: (relativePath: string, mtimeMs: number) => void;
  onDirSkipped?: (groupId: string, seenPaths: string[]) => void;
  existingByPath?: Map<string, ExistingTrackFingerprint>;
}

export class RootReaddirError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RootReaddirError';
  }
}

async function collectAudioFile(
  libraryRoot: string,
  full: string,
  ext: string,
  fsTimeoutMs: number,
  onWalkError?: (error: WalkErrorReport) => void,
): Promise<WalkedFile | null> {
  const format = AUDIO_EXTENSIONS[ext];
  if (!format) {
    return null;
  }
  try {
    const info = await withFsOp(`stat ${full}`, fsTimeoutMs, () => stat(full));
    return {
      absolutePath: full,
      relativePath: relative(libraryRoot, full),
      sizeBytes: info.size,
      mtimeMs: Math.floor(info.mtimeMs),
      format,
    };
  } catch (err) {
    onWalkError?.({
      path: full,
      op: 'stat',
      message: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

async function visitDirectory(
  libraryRoot: string,
  dir: string,
  buffer: WalkedFile[],
  options: WalkAudioFileChunksOptions,
): Promise<void> {
  const {
    shouldAbort,
    fsTimeoutMs = 15000,
    onWalkError,
  } = options;

  if (shouldAbort?.()) {
    return;
  }

  let entries;
  try {
    entries = await withFsOp(`readdir ${dir}`, fsTimeoutMs, () =>
      readdir(dir, { withFileTypes: true }),
    );
  } catch (err) {
    onWalkError?.({
      path: dir,
      op: 'readdir',
      message: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  for (const entry of entries) {
    if (shouldAbort?.()) {
      return;
    }
    if (entry.name.startsWith('._')) {
      continue;
    }
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!isJunkDir(entry.name)) {
        await visitDirectory(libraryRoot, full, buffer, options);
      }
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    const ext = extname(entry.name).toLowerCase();
    const walked = await collectAudioFile(
      libraryRoot,
      full,
      ext,
      fsTimeoutMs,
      onWalkError,
    );
    if (walked) {
      buffer.push(walked);
    }
  }
}

async function trySkipDirectoryGroup(
  libraryRoot: string,
  groupId: string,
  absoluteDir: string,
  options: WalkAudioFileChunksOptions,
): Promise<string[] | null> {
  const {
    skipUnchangedDirs,
    dirMtimes,
    existingByPath,
    fsTimeoutMs = 15000,
    onWalkError,
    onDirStat,
    onDirSkipped,
  } = options;

  if (!skipUnchangedDirs || !dirMtimes || !existingByPath || groupId === '.') {
    return null;
  }

  let info;
  try {
    info = await withFsOp(`stat ${absoluteDir}`, fsTimeoutMs, () => stat(absoluteDir));
  } catch (err) {
    onWalkError?.({
      path: absoluteDir,
      op: 'stat',
      message: err instanceof Error ? err.message : String(err),
    });
    return null;
  }

  const relativePath = relative(libraryRoot, absoluteDir);
  const mtimeMs = Math.floor(info.mtimeMs);
  onDirStat?.(relativePath, mtimeMs);

  const decision = canSkipDirectoryByMtime(
    groupId,
    mtimeMs,
    dirMtimes.get(relativePath),
    existingByPath,
  );
  if (!decision.skip) {
    return null;
  }

  onDirSkipped?.(groupId, decision.seenPaths);
  return decision.seenPaths;
}

export async function* walkAudioFileChunks(
  libraryRoot: string,
  options: WalkAudioFileChunksOptions = {},
): AsyncGenerator<{ groupId: string; files: WalkedFile[]; folderComplete: boolean }> {
  const {
    shouldAbort,
    chunkSize = 1000,
    fsTimeoutMs = 15000,
    onTopLevelFolder,
    onWalkError,
    completedGroups,
  } = options;

  let rootEntries;
  try {
    rootEntries = await withFsOp(`readdir ${libraryRoot}`, fsTimeoutMs, () =>
      readdir(libraryRoot, { withFileTypes: true }),
    );
  } catch (err) {
    throw new RootReaddirError(
      err instanceof Error ? err.message : String(err),
    );
  }

  const rootLabel = basename(libraryRoot) || libraryRoot;
  const rootAudioFiles: WalkedFile[] = [];
  const topLevelDirs: string[] = [];

  for (const entry of rootEntries) {
    if (shouldAbort?.()) {
      return;
    }
    if (entry.name.startsWith('._')) {
      continue;
    }
    const full = join(libraryRoot, entry.name);
    if (entry.isDirectory()) {
      if (!isJunkDir(entry.name)) {
        topLevelDirs.push(entry.name);
      }
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    const ext = extname(entry.name).toLowerCase();
    const walked = await collectAudioFile(
      libraryRoot,
      full,
      ext,
      fsTimeoutMs,
      onWalkError,
    );
    if (walked) {
      rootAudioFiles.push(walked);
    }
  }

  topLevelDirs.sort((a, b) => a.localeCompare(b));
  const groups: Array<{
    label: string;
    groupId: string;
    dir: string | null;
    seed: WalkedFile[];
  }> = [];

  if (rootAudioFiles.length > 0) {
    groups.push({ label: rootLabel, groupId: '.', dir: null, seed: rootAudioFiles });
  }
  for (const name of topLevelDirs) {
    groups.push({
      label: name,
      groupId: name,
      dir: join(libraryRoot, name),
      seed: [],
    });
  }

  const activeGroups = groups.filter(
    (group) => !completedGroups?.has(group.groupId),
  );
  const totalGroups = groups.length;
  let groupIndex = groups.length - activeGroups.length;

  for (const group of activeGroups) {
    if (shouldAbort?.()) {
      return;
    }
    groupIndex += 1;
    const resuming = Boolean(completedGroups && completedGroups.size > 0);
    onTopLevelFolder?.({
      label: group.label,
      groupId: group.groupId,
      index: groupIndex,
      total: totalGroups,
      resuming,
    });

    if (group.dir) {
      const skippedPaths = await trySkipDirectoryGroup(
        libraryRoot,
        group.groupId,
        group.dir,
        options,
      );
      if (skippedPaths) {
        yield { groupId: group.groupId, files: [], folderComplete: true };
        continue;
      }
    }

    const buffer = [...group.seed];
    if (group.dir) {
      await visitDirectory(libraryRoot, group.dir, buffer, options);
      if (shouldAbort?.()) {
        return;
      }
      try {
        const info = await withFsOp(`stat ${group.dir}`, fsTimeoutMs, () =>
          stat(group.dir!),
        );
        options.onDirStat?.(
          relative(libraryRoot, group.dir),
          Math.floor(info.mtimeMs),
        );
      } catch (err) {
        onWalkError?.({
          path: group.dir,
          op: 'stat',
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    for (let offset = 0; offset < buffer.length; offset += chunkSize) {
      if (shouldAbort?.()) {
        return;
      }
      const slice = buffer.slice(offset, offset + chunkSize);
      const folderComplete = offset + chunkSize >= buffer.length;
      yield { groupId: group.groupId, files: slice, folderComplete };
    }

    if (buffer.length === 0) {
      yield { groupId: group.groupId, files: [], folderComplete: true };
    }
  }
}

export async function checkLyricFileExists(
  absolutePath: string,
  fsTimeoutMs: number,
  onWalkError?: (error: WalkErrorReport) => void,
): Promise<boolean> {
  const ext = extname(absolutePath);
  const lrcPath = absolutePath.slice(0, absolutePath.length - ext.length) + '.lrc';
  try {
    await withFsOp(`exists ${lrcPath}`, fsTimeoutMs, () =>
      access(lrcPath, constants.F_OK),
    );
    return true;
  } catch (err) {
    const code =
      err && typeof err === 'object' && 'code' in err
        ? String((err as { code: unknown }).code)
        : '';
    if (code !== 'ENOENT') {
      onWalkError?.({
        path: lrcPath,
        op: 'exists',
        message: err instanceof Error ? err.message : String(err),
      });
    }
    return false;
  }
}

export function isFileUnchangedInCatalogue(
  file: WalkedFile,
  existingByPath: Map<string, ExistingTrackFingerprint>,
): boolean {
  return isUnchangedFile(file, existingByPath.get(file.relativePath));
}
