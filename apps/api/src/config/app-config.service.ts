import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import {
  buildLibraryPathLayout,
  parseLibraryPathEntries,
  resolveUnderLibraries,
  type LibraryPathLayout,
} from '../library/library-paths';
import { resolveFfmpegForYtdlp, isYtSaverPath } from '../external/ytdlp-path-utils';
import { findCommandOnPath } from './path-lookup';
import { readPortableConfig } from './portable-config';

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

  /** Repo root, or install folder when KARAOKEJ_ROOT is set (Electron). */
  get repoRoot(): string {
    const portableRoot = process.env.KARAOKEJ_ROOT?.trim();
    if (portableRoot) {
      return resolve(portableRoot);
    }
    return resolve(__dirname, '../../../../');
  }

  clearLibraryLayoutCache(): void {
    this.libraryLayoutCache = null;
  }

  get libraryPaths(): string[] {
    return this.libraryLayout.roots;
  }

  get libraryPath(): string | null {
    return this.libraryPaths[0] ?? null;
  }

  get libraryLayout(): LibraryPathLayout {
    if (!this.libraryLayoutCache) {
      let musicPath = this.config.get<string>('MUSIC_LIBRARY_PATH');
      if (!musicPath?.trim() && process.env.KARAOKEJ_ROOT?.trim()) {
        const portable = readPortableConfig(process.env.KARAOKEJ_ROOT);
        if (portable?.libraryPaths.length) {
          musicPath = portable.libraryPaths.join(',');
        }
      }
      const roots = parseLibraryPathEntries(musicPath, this.repoRoot);
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

  get audiodbBaseUrl(): string {
    return (
      this.config.get<string>('AUDIODB_BASE_URL')?.replace(/\/$/, '') ??
      'https://www.theaudiodb.com/api/v1/json'
    );
  }

  get audiodbApiKey(): string {
    return this.config.get<string>('AUDIODB_API_KEY')?.trim() || '123';
  }

  get deezerBaseUrl(): string {
    return (
      this.config.get<string>('DEEZER_BASE_URL')?.replace(/\/$/, '') ??
      'https://api.deezer.com'
    );
  }

  get ytsaverPath(): string {
    const raw =
      this.config.get<string>('YTSAVER_PATH') ??
      '/mnt/c/Program Files/YT Saver/ytsaverw.exe';
    return isAbsolute(raw) ? raw : resolve(this.repoRoot, raw);
  }

  get ytdlpPath(): string {
    const raw =
      this.config.get<string>('YTDLP_PATH') ??
      '/mnt/c/Program Files/yt-dlp/yt-dlp.exe';
    return isAbsolute(raw) ? raw : resolve(this.repoRoot, raw);
  }

  get ffmpegPath(): string {
    const raw = this.config.get<string>('FFMPEG_PATH')?.trim();
    if (raw && !isYtSaverPath(raw)) {
      return isAbsolute(raw) ? raw : resolve(this.repoRoot, raw);
    }
    if (existsSync('/usr/bin/ffmpeg')) {
      return '/usr/bin/ffmpeg';
    }
    const bundled = this.bundledWindowsFfmpegPath();
    if (existsSync(bundled)) {
      return bundled;
    }
    return 'ffmpeg';
  }

  /**
   * ffmpeg for yt-dlp post-processing. A Windows yt-dlp.exe cannot run
   * /usr/bin/ffmpeg, so use the vendored Windows build instead.
   */
  get ytdlpFfmpegPath(): string {
    const bundled = this.bundledWindowsFfmpegPath();
    return resolveFfmpegForYtdlp(
      this.ytdlpPath,
      this.ffmpegPath,
      existsSync(bundled) ? bundled : null,
    );
  }

  private bundledWindowsFfmpegPath(): string {
    return resolve(this.repoRoot, 'vendor/win/bin/ffmpeg.exe');
  }

  get ffprobePath(): string {
    const raw = this.config.get<string>('FFPROBE_PATH')?.trim();
    if (raw) {
      return isAbsolute(raw) ? raw : resolve(this.repoRoot, raw);
    }
    if (existsSync('/usr/bin/ffprobe')) {
      return '/usr/bin/ffprobe';
    }
    const ffmpeg = this.ffmpegPath;
    const sibling = ffmpeg.replace(/ffmpeg(\.exe)?$/i, 'ffprobe$1');
    if (existsSync(sibling)) {
      return sibling;
    }
    return 'ffprobe';
  }

  get demucsPath(): string {
    return this.config.get<string>('DEMUCS_PATH')?.trim() || 'demucs';
  }

  get demucsPythonModule(): string | null {
    return this.config.get<string>('DEMUCS_PYTHON_MODULE')?.trim() || null;
  }

  get demucsModel(): string {
    return this.config.get<string>('DEMUCS_MODEL')?.trim() || 'htdemucs';
  }

  get demucsExtraArgs(): string[] {
    const raw = this.config.get<string>('DEMUCS_EXTRA_ARGS')?.trim();
    if (!raw) {
      return [];
    }
    return raw.split(/\s+/).filter(Boolean);
  }

  get demucsTimeoutMs(): number {
    return clampInt(
      this.config.get<string>('DEMUCS_TIMEOUT_MS'),
      1_800_000,
      60_000,
      7_200_000,
    );
  }

  get stemCachePath(): string {
    const raw =
      this.config.get<string>('DEMUCS_STEM_CACHE_PATH') ??
      './data/karaoke-stems';
    const resolved = isAbsolute(raw) ? raw : resolve(this.repoRoot, raw);
    mkdirSync(resolved, { recursive: true });
    return resolved;
  }

  get coverCachePath(): string {
    const raw = this.config.get<string>('COVER_CACHE_PATH') ?? './data/covers';
    const resolved = isAbsolute(raw) ? raw : resolve(this.repoRoot, raw);
    mkdirSync(resolved, { recursive: true });
    return resolved;
  }

  get coverConcurrency(): number {
    return clampInt(this.config.get<string>('COVER_CONCURRENCY'), 4, 1, 8);
  }

  get coverTimeoutMs(): number {
    return clampInt(
      this.config.get<string>('COVER_TIMEOUT_MS'),
      20_000,
      2_000,
      120_000,
    );
  }

  isDemucsAvailable(): boolean {
    return this.resolveDemucsExecutable() !== null;
  }

  resolveDemucsExecutable(): string | null {
    const configured = this.demucsPath;
    if (configured.includes('/') || configured.includes('\\')) {
      return existsSync(configured) ? configured : null;
    }
    return findCommandOnPath(configured);
  }

  resolveDemucsSpawn(): { executable: string; prefixArgs: string[] } | null {
    const executable = this.resolveDemucsExecutable();
    if (!executable) {
      return null;
    }
    const module = this.demucsPythonModule;
    if (module) {
      return { executable, prefixArgs: ['-m', module] };
    }
    return { executable, prefixArgs: [] };
  }

  get ytdlpAudioFormat(): string {
    return this.config.get<string>('YTDLP_AUDIO_FORMAT')?.trim() || 'mp3';
  }

  /**
   * Node binary for yt-dlp YouTube JS challenges.
   * Windows yt-dlp.exe cannot run the WSL Node from nvm; prefer a Windows node.exe.
   */
  get ytdlpNodePath(): string {
    const raw = this.config.get<string>('YTDLP_NODE_PATH')?.trim();
    if (raw) {
      return isAbsolute(raw) ? raw : resolve(this.repoRoot, raw);
    }
    if (this.ytdlpPath.toLowerCase().endsWith('.exe')) {
      const windowsNode = '/mnt/c/Program Files/nodejs/node.exe';
      if (existsSync(windowsNode)) {
        return windowsNode;
      }
    }
    return process.execPath;
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
