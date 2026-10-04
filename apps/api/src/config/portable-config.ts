import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export interface PortableConfigFile {
  libraryPaths: string[];
}

export function portableConfigPath(karaokeRoot: string): string {
  return join(resolve(karaokeRoot), 'data', 'config.json');
}

export function readPortableConfig(karaokeRoot: string): PortableConfigFile | null {
  const path = portableConfigPath(karaokeRoot);
  if (!existsSync(path)) {
    return null;
  }
  try {
    const raw = readFileSync(path, 'utf8');
    const parsed = JSON.parse(raw) as PortableConfigFile;
    if (!Array.isArray(parsed.libraryPaths)) {
      return null;
    }
    return {
      libraryPaths: parsed.libraryPaths.filter(
        (entry): entry is string => typeof entry === 'string' && entry.trim().length > 0,
      ),
    };
  } catch {
    return null;
  }
}

export function writePortableConfig(
  karaokeRoot: string,
  libraryPaths: string[],
): PortableConfigFile {
  const path = portableConfigPath(karaokeRoot);
  mkdirSync(dirname(path), { recursive: true });
  const payload: PortableConfigFile = {
    libraryPaths: libraryPaths.map((p) => p.trim()).filter(Boolean),
  };
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return payload;
}
