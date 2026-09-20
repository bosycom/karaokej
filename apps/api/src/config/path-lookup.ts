import { existsSync } from 'node:fs';
import { delimiter as pathDelimiter, join } from 'node:path';

const WINDOWS_COMMAND_EXTENSIONS = ['', '.exe', '.cmd', '.bat'];

/** Split PATH using the platform delimiter (`:` on Unix, `;` on Windows). */
export function splitPathDirs(
  pathEnv: string,
  delimiter: string = pathDelimiter,
): string[] {
  return pathEnv.split(delimiter).filter(Boolean);
}

/**
 * Resolve a command name against PATH. On Windows, also tries `.exe` / `.cmd` / `.bat`.
 */
export function findCommandOnPath(
  name: string,
  options: {
    pathEnv?: string;
    delimiter?: string;
    platform?: NodeJS.Platform;
    exists?: (path: string) => boolean;
    joinPath?: (...parts: string[]) => string;
  } = {},
): string | null {
  const pathEnv = options.pathEnv ?? process.env.PATH ?? '';
  const delimiter = options.delimiter ?? pathDelimiter;
  const platform = options.platform ?? process.platform;
  const exists = options.exists ?? existsSync;
  const joinPath = options.joinPath ?? join;

  const hasSeparator = name.includes('/') || name.includes('\\');
  if (hasSeparator) {
    return exists(name) ? name : null;
  }

  const extensions =
    platform === 'win32' && !/\.[A-Za-z0-9]+$/.test(name)
      ? WINDOWS_COMMAND_EXTENSIONS
      : [''];

  for (const dir of splitPathDirs(pathEnv, delimiter)) {
    for (const ext of extensions) {
      const candidate = joinPath(dir, `${name}${ext}`);
      if (exists(candidate)) {
        return candidate;
      }
    }
  }
  return null;
}
