import { readdir, stat } from 'node:fs/promises';
import { basename, extname, join, relative } from 'node:path';
import {
  AUDIO_EXTENSIONS,
  ExistingTrackFingerprint,
  isJunkDir,
  isUnchangedFile,
  WalkedFile,
} from './fs-utils';
import { withFsOp } from './fs-timeout';
import { mapWithConcurrency } from './scan-metadata';
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
  walkConcurrency?: number;
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

interface PendingAudioFile {
  full: string;
  ext: string;
  name: string;
}

function lrcStemsFromEntries(
  entries: Array<{ name: string; isFile(): boolean }>,
): Set<string> {
  const stems = new Set<string>();
  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }
    if (entry.name.toLowerCase().endsWith('.lrc')) {
      stems.add(entry.name.slice(0, -4).toLowerCase());
    }
  }
  return stems;
}

function audioStem(filename: string): string {
  const ext = extname(filename);
  return filename.slice(0, filename.length - ext.length).toLowerCase();
}

async function statAudioFile(
  libraryRoot: string,
  pending: PendingAudioFile,
  lrcStems: Set<string>,
  onWalkError?: (error: WalkErrorReport) => void,
): Promise<WalkedFile | null> {
  const format = AUDIO_EXTENSIONS[pending.ext];
  if (!format) {
    return null;
  }
  try {
    const info = await stat(pending.full);
    return {
      absolutePath: pending.full,
      relativePath: relative(libraryRoot, pending.full),
      sizeBytes: info.size,
      mtimeMs: Math.floor(info.mtimeMs),
      format,
      hasLrc: lrcStems.has(audioStem(pending.name)),
    };
  } catch (err) {
    onWalkError?.({
      path: pending.full,
      op: 'stat',
      message: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

async function statAudioFilesParallel(
  libraryRoot: string,
  pending: PendingAudioFile[],
  lrcStems: Set<string>,
  walkConcurrency: number,
  onWalkError?: (error: WalkErrorReport) => void,
): Promise<WalkedFile[]> {
  if (pending.length === 0) {
    return [];
  }
  const walked = await mapWithConcurrency(
    pending,
    walkConcurrency,
    async (entry) => statAudioFile(libraryRoot, entry, lrcStems, onWalkError),
  );
  return walked.filter((file): file is WalkedFile => file != null);
}

async function* walkGroupFiles(
  libraryRoot: string,
  groupDir: string | null,
  seed: WalkedFile[],
  options: WalkAudioFileChunksOptions,
): AsyncGenerator<WalkedFile[]> {
  const {
    shouldAbort,
    chunkSize = 1000,
    walkConcurrency = 8,
    onWalkError,
  } = options;

  const buffer: WalkedFile[] = [...seed];

  const flushIfFull = function* (): Generator<WalkedFile[]> {
    while (buffer.length >= chunkSize) {
      yield buffer.splice(0, chunkSize);
    }
  };

  for (const chunk of flushIfFull()) {
    yield chunk;
  }

  if (!groupDir) {
    if (buffer.length > 0) {
      yield buffer.splice(0, buffer.length);
    }
    return;
  }

  const stack: string[] = [groupDir];

  while (stack.length > 0) {
    if (shouldAbort?.()) {
      return;
    }

    const dir = stack.pop()!;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (err) {
      onWalkError?.({
        path: dir,
        op: 'readdir',
        message: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    const lrcStems = lrcStemsFromEntries(entries);
    const pending: PendingAudioFile[] = [];
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
          stack.push(full);
        }
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      const ext = extname(entry.name).toLowerCase();
      if (AUDIO_EXTENSIONS[ext]) {
        pending.push({ full, ext, name: entry.name });
      }
    }

    const walked = await statAudioFilesParallel(
      libraryRoot,
      pending,
      lrcStems,
      walkConcurrency,
      onWalkError,
    );
    buffer.push(...walked);

    for (const chunk of flushIfFull()) {
      yield chunk;
    }
  }

  if (buffer.length > 0) {
    yield buffer.splice(0, buffer.length);
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
    onWalkError,
    onDirStat,
    onDirSkipped,
  } = options;

  if (!skipUnchangedDirs || !dirMtimes || !existingByPath || groupId === '.') {
    return null;
  }

  let info;
  try {
    info = await stat(absoluteDir);
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
    fsTimeoutMs = 15000,
    walkConcurrency = 8,
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
  const rootLrcStems = lrcStemsFromEntries(rootEntries);
  const rootPending: PendingAudioFile[] = [];
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
    if (AUDIO_EXTENSIONS[ext]) {
      rootPending.push({ full, ext, name: entry.name });
    }
  }

  const rootAudioFiles = await statAudioFilesParallel(
    libraryRoot,
    rootPending,
    rootLrcStems,
    walkConcurrency,
    onWalkError,
  );

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

    for await (const chunk of walkGroupFiles(
      libraryRoot,
      group.dir,
      group.seed,
      options,
    )) {
      if (shouldAbort?.()) {
        return;
      }
      yield { groupId: group.groupId, files: chunk, folderComplete: false };
    }

    if (group.dir) {
      try {
        const info = await stat(group.dir);
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

    yield { groupId: group.groupId, files: [], folderComplete: true };
  }
}

export function isFileUnchangedInCatalogue(
  file: WalkedFile,
  existingByPath: Map<string, ExistingTrackFingerprint>,
): boolean {
  return isUnchangedFile(file, existingByPath.get(file.relativePath));
}
