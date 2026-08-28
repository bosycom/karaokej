import { Worker } from 'node:worker_threads';
import { join } from 'node:path';
import type {
  ScanWorkerFromHostMessage,
  ScanWorkerStartPayload,
  ScanWorkerToHostMessage,
} from './scan-ipc';

export interface ScanWorkerHostOptions {
  workerScriptPath?: string;
  terminateTimeoutMs?: number;
  createWorker?: (scriptPath: string) => Worker;
}

export interface ScanWorkerRunOptions {
  payload: ScanWorkerStartPayload;
  shouldCancel?: () => boolean;
  onMessage?: (message: ScanWorkerToHostMessage) => void | Promise<void>;
}

export class ScanWorkerHost {
  private worker: Worker | null = null;
  private readonly workerScriptPath: string;
  private readonly terminateTimeoutMs: number;
  private readonly createWorker: (scriptPath: string) => Worker;

  constructor(options: ScanWorkerHostOptions = {}) {
    this.workerScriptPath =
      options.workerScriptPath ?? join(__dirname, 'scan.worker.js');
    this.terminateTimeoutMs = options.terminateTimeoutMs ?? 20000;
    this.createWorker =
      options.createWorker ??
      ((scriptPath) =>
        new Worker(scriptPath, {
          execArgv: process.execArgv,
        }));
  }

  cancel(): void {
    if (!this.worker) {
      return;
    }
    this.worker.postMessage({ type: 'cancel' } satisfies ScanWorkerFromHostMessage);
    setTimeout(() => {
      void this.terminate();
    }, this.terminateTimeoutMs);
  }

  async terminate(): Promise<void> {
    if (!this.worker) {
      return;
    }
    const worker = this.worker;
    this.worker = null;
    await worker.terminate();
  }

  async run(options: ScanWorkerRunOptions): Promise<void> {
    await this.terminate();
    this.worker = this.createWorker(this.workerScriptPath);

    return new Promise<void>((resolve, reject) => {
      const worker = this.worker!;
      let settled = false;

      const finish = async (err?: Error) => {
        if (settled) {
          return;
        }
        settled = true;
        worker.removeAllListeners();
        await this.terminate();
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      };

      worker.on('message', (message: ScanWorkerToHostMessage) => {
        if (options.shouldCancel?.()) {
          this.cancel();
        }
        void Promise.resolve(options.onMessage?.(message))
          .then(() => {
            if (message.type === 'done') {
              void finish();
            } else if (message.type === 'failed') {
              void finish(new Error(message.message));
            }
          })
          .catch((err) => {
            void finish(err instanceof Error ? err : new Error(String(err)));
          });
      });

      worker.on('error', (err) => {
        void finish(err);
      });

      worker.on('exit', (code) => {
        if (!settled && code !== 0) {
          void finish(new Error(`Scan worker exited with code ${code}`));
          return;
        }
        if (!settled) {
          void finish();
        }
      });

      worker.postMessage({
        type: 'start',
        payload: options.payload,
      } satisfies ScanWorkerFromHostMessage);
    });
  }
}
