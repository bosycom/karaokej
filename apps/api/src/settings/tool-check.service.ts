import { existsSync } from 'node:fs';
import { Injectable } from '@nestjs/common';
import { ToolCheckResultDto, ToolId } from '@karaokej/shared';
import { AppConfigService } from '../config/app-config.service';
import { spawnCollect } from '../external/ytdlp-cli';
import { findCommandOnPath } from '../config/path-lookup';
import { firstVersionLine } from './tool-version';

const CHECK_TIMEOUT_MS = 12_000;

@Injectable()
export class ToolCheckService {
  constructor(private readonly config: AppConfigService) {}

  async check(tool: ToolId): Promise<ToolCheckResultDto> {
    switch (tool) {
      case 'ffmpeg':
        return this.checkSpawnVersion(this.config.ffmpegPath, ['-version'], 'ffmpeg');
      case 'ffprobe':
        return this.checkSpawnVersion(this.config.ffprobePath, ['-version'], 'ffprobe');
      case 'ytdlp':
        return this.checkSpawnVersion(this.config.ytdlpPath, ['--version'], 'yt-dlp');
      case 'node':
        return this.checkSpawnVersion(this.config.ytdlpNodePath, ['--version'], 'Node.js');
      case 'demucs':
        return this.checkDemucs();
      case 'ytsaver':
        return this.checkYtsaver();
      default:
        return { version: null, message: 'Unknown tool' };
    }
  }

  private async checkYtsaver(): Promise<ToolCheckResultDto> {
    const path = this.config.ytsaverPath;
    if (!existsSync(path)) {
      return { version: null, message: `File not found at ${path}` };
    }
    return { version: null, message: 'Executable found (not launched)' };
  }

  private async checkDemucs(): Promise<ToolCheckResultDto> {
    const spawnInfo = this.config.resolveDemucsSpawn();
    if (!spawnInfo) {
      const configured = this.config.demucsPath;
      return {
        version: null,
        message: configured.includes('/') || configured.includes('\\')
          ? `File not found at ${configured}`
          : `${configured} not found on PATH`,
      };
    }
    const args = [...spawnInfo.prefixArgs, '--version'];
    return this.checkSpawnVersion(spawnInfo.executable, args, 'Demucs');
  }

  private async checkSpawnVersion(
    executable: string,
    args: string[],
    label: string,
  ): Promise<ToolCheckResultDto> {
    const needsPathLookup =
      !executable.includes('/') &&
      !executable.includes('\\') &&
      !executable.toLowerCase().endsWith('.exe');
    const resolved =
      needsPathLookup && !existsSync(executable)
        ? findCommandOnPath(executable)
        : executable;

    if (!resolved) {
      return { version: null, message: `${label} not found on PATH` };
    }
    if (
      (resolved.includes('/') || resolved.includes('\\') || resolved.toLowerCase().endsWith('.exe')) &&
      !existsSync(resolved)
    ) {
      return { version: null, message: `File not found at ${resolved}` };
    }

    try {
      const { stdout, stderr, code } = await spawnCollect(
        resolved,
        args,
        CHECK_TIMEOUT_MS,
      );
      if (code !== 0) {
        const detail = firstVersionLine(stdout, stderr) ?? stderr.trim() ?? 'Check failed';
        return { version: null, message: detail || `${label} exited with code ${code}` };
      }
      const version = firstVersionLine(stdout, stderr);
      return {
        version,
        message: version ?? 'Check succeeded',
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { version: null, message };
    }
  }
}
