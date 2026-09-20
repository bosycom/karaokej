import { describe, expect, it } from 'vitest';
import { findCommandOnPath, splitPathDirs } from './path-lookup';

describe('splitPathDirs', () => {
  it('splits Windows PATH on semicolons', () => {
    expect(splitPathDirs('C:\\Tools;C:\\Windows\\System32', ';')).toEqual([
      'C:\\Tools',
      'C:\\Windows\\System32',
    ]);
  });

  it('splits Unix PATH on colons', () => {
    expect(splitPathDirs('/usr/bin:/usr/local/bin', ':')).toEqual([
      '/usr/bin',
      '/usr/local/bin',
    ]);
  });
});

describe('findCommandOnPath', () => {
  it('finds demucs.exe on a Windows PATH', () => {
    const found = findCommandOnPath('demucs', {
      pathEnv: 'C:\\Windows\\System32;C:\\Python\\Scripts',
      delimiter: ';',
      platform: 'win32',
      joinPath: (...parts) => parts.join('\\'),
      exists: (path) => path === 'C:\\Python\\Scripts\\demucs.exe',
    });
    expect(found).toBe('C:\\Python\\Scripts\\demucs.exe');
  });

  it('does not treat C: as a PATH entry when splitting on colon', () => {
    const found = findCommandOnPath('demucs', {
      pathEnv: 'C:\\Python\\Scripts;C:\\Tools',
      delimiter: ':',
      platform: 'win32',
      joinPath: (...parts) => parts.join('\\'),
      exists: (path) =>
        path === 'C:\\Python\\Scripts\\demucs.exe' ||
        path === 'C:\\Tools\\demucs.exe',
    });
    expect(found).toBeNull();
  });

  it('returns a configured absolute path when it exists', () => {
    expect(
      findCommandOnPath('C:\\Tools\\demucs.exe', {
        exists: (path) => path === 'C:\\Tools\\demucs.exe',
      }),
    ).toBe('C:\\Tools\\demucs.exe');
  });
});
