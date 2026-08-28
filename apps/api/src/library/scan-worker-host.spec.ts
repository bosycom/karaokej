import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { ScanWorkerHost } from './scan-worker-host';
import type { ScanWorkerToHostMessage } from './scan-ipc';

class MockWorker extends EventEmitter {
  postMessage = vi.fn();
  terminate = vi.fn(async () => undefined);
  removeAllListeners = () => {
    super.removeAllListeners();
    return this;
  };
}

describe('ScanWorkerHost', () => {
  it('delivers worker messages and resolves on done', async () => {
    const worker = new MockWorker();
    const host = new ScanWorkerHost({
      createWorker: () => worker as never,
    });
    const messages: ScanWorkerToHostMessage[] = [];

    const runPromise = host.run({
      payload: {
        root: '/music',
        chunkSize: 100,
        metadataConcurrency: 2,
        walkConcurrency: 2,
        fsTimeoutMs: 1000,
        skipLrcOnUnchanged: false,
        skipUnchangedDirs: false,
        durationMode: 'header_only',
        completedGroups: [],
        existingByPath: {},
        dirMtimes: {},
      },
      onMessage: (message) => {
        messages.push(message);
      },
    });

    await Promise.resolve();

    expect(worker.postMessage).toHaveBeenCalledWith({
      type: 'start',
      payload: expect.objectContaining({ root: '/music' }),
    });

    worker.emit('message', {
      type: 'chunk',
      groupId: 'Rock',
      items: [],
      folderComplete: true,
      stats: { parsed: 0, unchanged: 0, durationFallback: 0 },
    } satisfies ScanWorkerToHostMessage);
    worker.emit('message', {
      type: 'done',
      processed: 0,
      skippedDirs: 0,
    } satisfies ScanWorkerToHostMessage);

    await runPromise;
    expect(messages.map((message) => message.type)).toEqual(['chunk', 'done']);
  });

  it('posts cancel to the worker', async () => {
    const worker = new MockWorker();
    const host = new ScanWorkerHost({
      createWorker: () => worker as never,
      terminateTimeoutMs: 10,
    });

    const runPromise = host.run({
      payload: {
        root: '/music',
        chunkSize: 100,
        metadataConcurrency: 1,
        walkConcurrency: 1,
        fsTimeoutMs: 1000,
        skipLrcOnUnchanged: false,
        skipUnchangedDirs: false,
        durationMode: 'header_only',
        completedGroups: [],
        existingByPath: {},
        dirMtimes: {},
      },
    });
    await Promise.resolve();
    host.cancel();
    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'cancel' });
    worker.emit('message', {
      type: 'done',
      processed: 0,
      skippedDirs: 0,
    } satisfies ScanWorkerToHostMessage);
    await runPromise;
  });
});
