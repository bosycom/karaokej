import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const renameMock = vi.fn();
const unlinkMock = vi.fn();
const restoreShouldFail = { value: false };

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    rename: (...args: unknown[]) => {
      renameMock(...args);
      throw new Error('rename must not be used on library files');
    },
    unlink: (...args: Parameters<typeof actual.unlink>) => {
      unlinkMock(...args);
      return actual.unlink(...args);
    },
    // Only the rollback path reads a whole file back, so this fails the restore.
    readFile: (...args: Parameters<typeof actual.readFile>) => {
      if (restoreShouldFail.value) {
        return Promise.reject(new Error('backup is unreadable'));
      }
      return actual.readFile(...args);
    },
  };
});

import {
  safePatchRegion,
  safeReplaceWithBuffer,
  safeReplaceWithTempFile,
} from './safe-file-write';

const ORIGINAL = Buffer.from('HEADER----AUDIOAUDIOAUDIO');
const HEADER_BYTES = 10;

describe('safe-file-write', () => {
  let dir: string;
  let target: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'safe-file-write-'));
    target = join(dir, 'song.mp3');
    writeFileSync(target, ORIGINAL);
    renameMock.mockClear();
    unlinkMock.mockClear();
    restoreShouldFail.value = false;
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const siblings = () => readdirSync(dir).filter((name) => name !== 'song.mp3');

  describe('safeReplaceWithBuffer', () => {
    it('replaces the content and leaves no sidecar files behind', async () => {
      const next = Buffer.from('NEWHEADER-AUDIOAUDIOAUDIOEXTRA');

      await safeReplaceWithBuffer(target, next);

      expect(readFileSync(target)).toEqual(next);
      expect(siblings()).toEqual([]);
      expect(renameMock).not.toHaveBeenCalled();
    });

    it('restores the original when verification rejects the result', async () => {
      const next = Buffer.from('BROKEN');

      await expect(
        safeReplaceWithBuffer(target, next, {
          verify: async () => {
            throw new Error('not a valid mp3');
          },
        }),
      ).rejects.toThrow(/song\.mp3/);

      expect(readFileSync(target)).toEqual(ORIGINAL);
      expect(siblings()).toEqual([]);
    });

    it('keeps the backup when the original cannot be put back', async () => {
      restoreShouldFail.value = true;

      await expect(
        safeReplaceWithBuffer(target, Buffer.from('BROKEN'), {
          verify: async () => {
            throw new Error('not a valid mp3');
          },
        }),
      ).rejects.toThrow(/must be restored by hand/);

      expect(siblings()).toEqual(['song.mp3.karaokej-bak']);
      expect(readFileSync(join(dir, 'song.mp3.karaokej-bak'))).toEqual(ORIGINAL);
    });

    it('refuses to write an empty file', async () => {
      await expect(safeReplaceWithBuffer(target, Buffer.alloc(0))).rejects.toThrow(
        /empty file/,
      );
      expect(readFileSync(target)).toEqual(ORIGINAL);
    });

    it('never unlinks the target', async () => {
      await safeReplaceWithBuffer(target, Buffer.from('NEW-CONTENT'));

      const unlinked = unlinkMock.mock.calls.map(([path]) => String(path));
      expect(unlinked).not.toContain(target);
    });

    it('serialises concurrent writes to the same path', async () => {
      const first = Buffer.from('FIRST-CONTENT');
      const second = Buffer.from('SECOND-CONTENT-LONGER');

      await Promise.all([
        safeReplaceWithBuffer(target, first),
        safeReplaceWithBuffer(target, second),
      ]);

      expect(readFileSync(target)).toEqual(second);
      expect(siblings()).toEqual([]);
    });
  });

  describe('safeReplaceWithTempFile', () => {
    it('copies the produced temp file into the target', async () => {
      const next = Buffer.from('REBUILT-HEADERAUDIOAUDIOAUDIO');

      await safeReplaceWithTempFile(target, async (tempPath) => {
        writeFileSync(tempPath, next);
      });

      expect(readFileSync(target)).toEqual(next);
      expect(siblings()).toEqual([]);
    });

    it('leaves the target untouched when producing the content fails', async () => {
      await expect(
        safeReplaceWithTempFile(target, async () => {
          throw new Error('rebuild failed');
        }),
      ).rejects.toThrow('rebuild failed');

      expect(readFileSync(target)).toEqual(ORIGINAL);
      expect(siblings()).toEqual([]);
    });

    it('rejects an empty temp file without touching the target', async () => {
      await expect(
        safeReplaceWithTempFile(target, async (tempPath) => {
          writeFileSync(tempPath, Buffer.alloc(0));
        }),
      ).rejects.toThrow(/empty file/);

      expect(readFileSync(target)).toEqual(ORIGINAL);
      expect(siblings()).toEqual([]);
    });
  });

  describe('safePatchRegion', () => {
    it('rewrites the region without changing the file length', async () => {
      const region = Buffer.from('PATCHED---');

      await safePatchRegion(target, region, 0);

      const after = readFileSync(target);
      expect(after.length).toBe(ORIGINAL.length);
      expect(after.subarray(0, HEADER_BYTES)).toEqual(region);
      expect(after.subarray(HEADER_BYTES)).toEqual(ORIGINAL.subarray(HEADER_BYTES));
      expect(siblings()).toEqual([]);
    });

    it('restores the region and keeps the audio when verification fails', async () => {
      await expect(
        safePatchRegion(target, Buffer.from('PATCHED---'), 0, {
          verify: async () => {
            throw new Error('tag area is wrong');
          },
        }),
      ).rejects.toThrow(/song\.mp3/);

      expect(readFileSync(target)).toEqual(ORIGINAL);
      expect(siblings()).toEqual([]);
    });

    it('refuses a patch that would extend the file', async () => {
      await expect(
        safePatchRegion(target, Buffer.alloc(ORIGINAL.length + 1, 0x41), 0),
      ).rejects.toThrow(/would extend/);

      expect(readFileSync(target)).toEqual(ORIGINAL);
    });
  });
});
