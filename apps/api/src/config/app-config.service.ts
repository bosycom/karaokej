import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdirSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import {
  buildLibraryPathLayout,
  parseLibraryPathEntries,
  resolveUnderLibraries,
  type LibraryPathLayout,
} from '../library/library-paths';

function clampInt(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}

function envFlag(value: string | undefined): boolean {
  return value === '1' || value?.toLowerCase() === 'true';
}

@Injectable()
export class AppConfigService {
  private libraryLayoutCache: LibraryPathLayout | null = null;

  constructor(private readonly config: ConfigService) {}

  /** Repo root: apps/api/dist/config -> ../../../../ */
  get repoRoot(): string {
    return resolve(__dirname, '../../../../');
  }

  get libraryPaths(): string[] {
    return this.libraryLayout.roots;
  }

  get libraryPath(): string | null {
    return this.libraryPaths[0] ?? null;
  }

  get libraryLayout(): LibraryPathLayout {
    if (!this.libraryLayoutCache) {
      const roots = parseLibraryPathEntries(
        this.config.get<string>('MUSIC_LIBRARY_PATH'),
        this.repoRoot,
      );
      this.libraryLayoutCache = buildLibraryPathLayout(roots);
    }
    return this.libraryLayoutCache;
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

  get scanChunkSize(): number {
    return clampInt(
      this.config.get<string>('LIBRARY_SCAN_CHUNK_SIZE'),
      1000,
      50,
      5000,
    );
  }

  get scanMetadataConcurrency(): number {
    return clampInt(
      this.config.get<string>('LIBRARY_SCAN_METADATA_CONCURRENCY'),
      8,
      1,
      8,
    );
  }

  get scanWalkConcurrency(): number {
    return clampInt(
      this.config.get<string>('LIBRARY_SCAN_WALK_CONCURRENCY'),
      this.scanMetadataConcurrency,
      1,
      8,
    );
  }

  get scanFsTimeoutMs(): number {
    return clampInt(
      this.config.get<string>('LIBRARY_SCAN_FS_TIMEOUT_MS'),
      15000,
      1000,
      120000,
    );
  }

  get scanSkipUnchangedDirs(): boolean {
    return envFlag(this.config.get<string>('LIBRARY_SCAN_SKIP_UNCHANGED_DIRS'));
  }

  get scanSkipLrcOnUnchanged(): boolean {
    return envFlag(this.config.get<string>('LIBRARY_SCAN_SKIP_LRC_ON_UNCHANGED'));
  }

  get scanDurationMode(): 'header_only' | 'full_fallback' {
    const raw = this.config
      .get<string>('LIBRARY_SCAN_DURATION_MODE')
      ?.trim()
      .toLowerCase();
    return raw === 'header_only' ? 'header_only' : 'full_fallback';
  }

  resolveUnderLibrary(
    relativePath: string,
    legacyUnprefixedRoot?: string | null,
  ): string | null {
    return resolveUnderLibraries(
      relativePath,
      this.libraryLayout,
      legacyUnprefixedRoot ?? this.libraryPath,
    );
  }
}
