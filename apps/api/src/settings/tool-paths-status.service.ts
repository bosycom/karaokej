import { existsSync } from 'node:fs';
import { Injectable } from '@nestjs/common';
import { ToolPathsStatusDto } from '@karaokej/shared';
import { AppConfigService } from '../config/app-config.service';
import { findCommandOnPath } from '../config/path-lookup';

@Injectable()
export class ToolPathsStatusService {
  constructor(private readonly config: AppConfigService) {}

  status(): ToolPathsStatusDto {
    const tools: ToolPathsStatusDto['tools'] = [
      {
        id: 'ffmpeg',
        effectivePath: this.config.ffmpegPath,
        available: this.isExecutableAvailable(this.config.ffmpegPath),
      },
      {
        id: 'ffprobe',
        effectivePath: this.config.ffprobePath,
        available: this.isExecutableAvailable(this.config.ffprobePath),
      },
      {
        id: 'ytdlp',
        effectivePath: this.config.ytdlpPath,
        available: existsSync(this.config.ytdlpPath),
      },
      {
        id: 'node',
        effectivePath: this.config.ytdlpNodePath,
        available: this.isExecutableAvailable(this.config.ytdlpNodePath),
      },
      {
        id: 'demucs',
        effectivePath: this.config.demucsPath,
        available: this.config.isDemucsAvailable(),
      },
      {
        id: 'ytsaver',
        effectivePath: this.config.ytsaverPath,
        available: existsSync(this.config.ytsaverPath),
      },
    ];
    return { tools };
  }

  private isExecutableAvailable(executable: string): boolean {
    if (!executable) {
      return false;
    }
    if (
      executable.includes('/') ||
      executable.includes('\\') ||
      executable.toLowerCase().endsWith('.exe')
    ) {
      return existsSync(executable);
    }
    return findCommandOnPath(executable) !== null;
  }
}
