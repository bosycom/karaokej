import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';

@Injectable()
export class YtsaverService {
  constructor(private readonly config: AppConfigService) {}

  isAvailable(): boolean {
    return existsSync(this.config.ytsaverPath);
  }

  launch(): void {
    const executable = this.config.ytsaverPath;
    if (!existsSync(executable)) {
      throw new ServiceUnavailableException(
        'YT Saver is not installed at the configured path',
      );
    }
    const child = spawn(executable, [], {
      detached: true,
      stdio: 'ignore',
      shell: false,
    });
    child.unref();
  }
}
