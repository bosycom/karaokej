import { parentPort } from 'node:worker_threads';
import { existsSync } from 'node:fs';
import { extname } from 'node:path';
import { lyricPathFor } from './fs-utils';
import { mapWithConcurrency, readTrackMetadata } from './scan-metadata';
import {
  checkLyricFileExists,
  isFileUnchangedInCatalogue,
  walkAudioFileChunks,
} from './scan-walker';
import type {
  ScanChunkItem,
  ScanWorkerFromHostMessage,
  ScanWorkerStartPayload,
  ScanWorkerToHostMessage,
  WalkErrorReport,
} from './scan-ipc';

let cancelRequested = false;
let skippedDirs = 0;

function post(message: ScanWorkerToHostMessage): void {
  parentPort?.postMessage(message);
}

function reportWalkError(error: WalkErrorReport): void {
  post({ type: 'walkError', error });
}

async function processChunkItems(
  payload: ScanWorkerStartPayload,
  files: Array<{
    absolutePath: string;
    relativePath: string;
    sizeBytes: number;
    mtimeMs: number;
    format: ScanChunkItem['format'];
  }>,
  existingByPath: Map<string, { size_bytes: number; mtime_ms: number }>,
): Promise<ScanChunkItem[]> {
  const changed = files.filter(
    (file) => !isFileUnchangedInCatalogue(file, existingByPath),
  );

  const metadataByPath = new Map<string, Awaited<ReturnType<typeof readTrackMetadata>>>();
  if (changed.length > 0) {
    const parsed = await mapWithConcurrency(
      changed,
      payload.metadataConcurrency,
      async (file) => ({
        relativePath: file.relativePath,
        metadata: await readTrackMetadata(
          file.absolutePath,
          file.relativePath,
          payload.fsTimeoutMs,
        ),
      }),
    );
    for (const entry of parsed) {
      metadataByPath.set(entry.relativePath, entry.metadata);
    }
  }

  const items: ScanChunkItem[] = [];
  for (const file of files) {
    const unchanged = isFileUnchangedInCatalogue(file, existingByPath);
    let hasLrc: boolean | null = null;
    if (!unchanged || !payload.skipLrcOnUnchanged) {
      if (payload.fsTimeoutMs > 0) {
        hasLrc = await checkLyricFileExists(
          file.absolutePath,
          payload.fsTimeoutMs,
          reportWalkError,
        );
      } else {
        hasLrc = existsSync(lyricPathFor(file.absolutePath));
      }
    }

    items.push({
      ...file,
      unchanged,
      hasLrc,
      metadata: unchanged ? null : metadataByPath.get(file.relativePath) ?? null,
    });
  }

  return items;
}

async function runScan(payload: ScanWorkerStartPayload): Promise<void> {
  cancelRequested = false;
  skippedDirs = 0;

  const existingByPath = new Map(Object.entries(payload.existingByPath));
  const completedGroups = new Set(payload.completedGroups);
  const dirMtimes = new Map(Object.entries(payload.dirMtimes));
  let processed = 0;
  let currentFolder: {
    label: string;
    groupId: string;
    index: number;
    total: number;
    resuming?: boolean;
  } | null = null;

  try {
    for await (const batch of walkAudioFileChunks(payload.root, {
      chunkSize: payload.chunkSize,
      fsTimeoutMs: payload.fsTimeoutMs,
      shouldAbort: () => cancelRequested,
      completedGroups,
      skipUnchangedDirs: payload.skipUnchangedDirs,
      dirMtimes,
      existingByPath,
      onWalkError: reportWalkError,
      onDirStat: (relativePath, mtimeMs) => {
        post({ type: 'dirStat', relativePath, mtimeMs });
      },
      onDirSkipped: (groupId, seenPaths) => {
        skippedDirs += 1;
        processed += seenPaths.length;
        post({ type: 'dirSkipped', groupId, seenPaths });
        post({
          type: 'progress',
          processed,
          folder: {
            label: groupId === '.' ? 'root' : groupId,
            groupId,
            index: 0,
            total: 0,
          },
        });
      },
      onTopLevelFolder: (folder) => {
        currentFolder = folder;
        post({
          type: 'progress',
          processed,
          folder,
        });
      },
    })) {
      if (cancelRequested) {
        return;
      }

      if (batch.files.length === 0 && batch.folderComplete) {
        post({
          type: 'chunk',
          groupId: batch.groupId,
          items: [],
          folderComplete: true,
        });
        continue;
      }

      const items = await processChunkItems(payload, batch.files, existingByPath);
      processed += items.length;
      post({
        type: 'chunk',
        groupId: batch.groupId,
        items,
        folderComplete: batch.folderComplete,
      });
      if (currentFolder) {
        post({
          type: 'progress',
          processed,
          folder: currentFolder,
        });
      }
    }

    if (!cancelRequested) {
      post({ type: 'done', processed, skippedDirs });
    }
  } catch (err) {
    post({
      type: 'failed',
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

parentPort?.on('message', (message: ScanWorkerFromHostMessage) => {
  if (message.type === 'cancel') {
    cancelRequested = true;
    return;
  }
  if (message.type === 'start') {
    void runScan(message.payload);
  }
});
