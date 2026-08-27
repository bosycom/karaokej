import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdirSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';

@Injectable()
export class AppConfigService {
  constructor(private readonly config: ConfigService) {}

  /** Repo root: apps/api/dist/config -> ../../../../ */
  get repoRoot(): string {
    return resolve(__dirname, '../../../../');
  }

  get libraryPath(): string | null {
    const raw = this.config.get<string>('MUSIC_LIBRARY_PATH')?.trim();
    if (!raw) {
      return null;
    }
    return isAbsolute(raw) ? resolve(raw) : resolve(this.repoRoot, raw);
  }

  get databasePath(): string {
    const raw =
      this.config.get<string>('DATABASE_PATH') ?? './data/karaokej.sqlite';
    const resolved = isAbsolute(raw) ? raw : resolve(this.repoRoot, raw);
    mkdirSync(dirname(resolved), { recursive: true });
    return resolved;
  }

  get lrclibBaseUrl(): string {
    return (
      this.config.get<string>('LRCLIB_BASE_URL')?.replace(/\/$/, '') ??
      'https://lrclib.net'
    );
  }

  resolveUnderLibrary(relativePath: string): string | null {
    const root = this.libraryPath;
    if (!root) {
      return null;
    }
    const absolute = resolve(root, relativePath);
    if (absolute !== root && !absolute.startsWith(root + '/')) {
      return null;
    }
    return absolute;
  }
}
