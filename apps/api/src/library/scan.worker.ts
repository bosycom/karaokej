import { parentPort } from 'node:worker_threads';
import {
  isFileUnchangedInCatalogue,
  walkAudioFileChunks,
} from './scan-walker';
import type {
  ScanChunkItem,
  ScanChunkStats,
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

function processChunkItems(
  payload: ScanWorkerStartPayload,
  files: Array<{
    absolutePath: string;
    relativePath: string;
    sizeBytes: number;
    mtimeMs: number;
    format: ScanChunkItem['format'];
    hasLrc: boolean;
  }>,
  existingByPath: Map<string, { size_bytes: number; mtime_ms: number }>,
): { items: ScanChunkItem[]; stats: ScanChunkStats } {
  const stats: ScanChunkStats = {
    parsed: 0,
    unchanged: 0,
  };
  const items: ScanChunkItem[] = [];

  for (const file of files) {
    const unchanged = isFileUnchangedInCatalogue(file, existingByPath);
    const hasLrc =
      unchanged && payload.skipLrcOnUnchanged ? null : file.hasLrc;

    if (unchanged) {
      stats.unchanged += 1;
    } else {
      stats.parsed += 1;
    }

    items.push({
      ...file,
      unchanged,
      hasLrc,
      metadata: null,
    });
  }

  return { items, stats };
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
      walkConcurrency: payload.walkConcurrency,
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
          stats: { parsed: 0, unchanged: 0 },
        });
        continue;
      }

      const { items, stats } = processChunkItems(
        payload,
        batch.files,
        existingByPath,
      );
      processed += items.length;
      post({
        type: 'chunk',
        groupId: batch.groupId,
        items,
        folderComplete: batch.folderComplete,
        stats,
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
