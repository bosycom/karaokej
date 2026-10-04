import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { AppConfigService } from '../config/app-config.service';

const UPDATE_INTERVAL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class YtdlpUpdateService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(YtdlpUpdateService.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly config: AppConfigService) {}

  onModuleInit(): void {
    if (process.env.YTDLP_SELF_UPDATE !== '1') {
      return;
    }
    const path = this.config.ytdlpPath;
    if (!path.toLowerCase().endsWith('.exe') || !existsSync(path)) {
      return;
    }
    void this.runUpdate('startup');
    this.timer = setInterval(() => {
      void this.runUpdate('scheduled');
    }, UPDATE_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private runUpdate(reason: string): Promise<void> {
    const executable = this.config.ytdlpPath;
    return new Promise((resolve) => {
      const child = spawn(executable, ['-U'], {
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stderr = '';
      child.stderr?.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      child.on('error', (err) => {
        this.logger.warn(`yt-dlp update (${reason}) failed: ${err.message}`);
        resolve();
      });
      child.on('close', (code) => {
        if (code === 0) {
          this.logger.log(`yt-dlp self-update (${reason}) finished`);
        } else {
          this.logger.warn(
            `yt-dlp self-update (${reason}) exited ${code}: ${stderr.slice(0, 300)}`,
          );
        }
        resolve();
      });
    });
  }
}
