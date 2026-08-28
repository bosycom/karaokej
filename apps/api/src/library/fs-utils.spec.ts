import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import {
  estimateScanRate,
  formatPhase1ScanMessage,
  formatPhase2ScanMessage,
  formatScanCompleteMessage,
  formatScanProgressMessage,
  formatScanRate,
  isJunkDir,
  isUnchangedFile,
} from './fs-utils';
import {
  canSkipDirectoryByMtime,
  displayScanPath,
  groupIdForRelativePath,
  parseScanCheckpoint,
  parseScanIssues,
  pathsUnderGroup,
  seedSeenFromCompletedGroups,
} from './scan-checkpoint';
import {
  RootReaddirError,
  walkAudioFileChunks,
} from './scan-walker';

async function createLibraryTree(root: string): Promise<void> {
  await mkdir(join(root, 'Rock', 'Album A'), { recursive: true });
  await mkdir(join(root, 'Jazz'), { recursive: true });
  await mkdir(join(root, '.git'), { recursive: true });
  await writeFile(join(root, 'root-track.mp3'), 'root');
  await writeFile(join(root, 'Rock', 'Album A', 'song1.mp3'), 'one');
  await writeFile(join(root, 'Rock', 'Album A', 'song2.flac'), 'two');
  await writeFile(join(root, 'Jazz', 'live.opus'), 'three');
  await writeFile(join(root, '.git', 'ignored.mp3'), 'ignored');
  await writeFile(join(root, 'Rock', 'notes.txt'), 'not audio');
}

describe('isUnchangedFile', () => {
  it('returns false when no catalogue row exists', () => {
    expect(
      isUnchangedFile({ sizeBytes: 100, mtimeMs: 500 }, undefined),
    ).toBe(false);
  });

  it('returns true when size and mtime match', () => {
    expect(
      isUnchangedFile(
        { sizeBytes: 100, mtimeMs: 500 },
        { size_bytes: 100, mtime_ms: 500 },
      ),
    ).toBe(true);
  });
});

describe('formatScanProgressMessage', () => {
  it('includes folder and processed count', () => {
    expect(
      formatScanProgressMessage({ label: 'Rock', index: 2, total: 5 }, 1200),
    ).toBe('Scanning Rock (2/5) · 1,200 files');
  });

  it('prefixes resume wording', () => {
    expect(
      formatScanProgressMessage(
        { label: 'Rock', index: 2, total: 5, resuming: true },
        1200,
      ),
    ).toBe('Resuming Rock (2/5) · 1,200 files');
  });

  it('appends an approximate files-per-second rate', () => {
    expect(
      formatScanProgressMessage(
        { label: 'Rock', index: 2, total: 5 },
        1200,
        0,
        85.4,
      ),
    ).toBe('Scanning Rock (2/5) · 1,200 files · ~85/s');
  });
});

describe('estimateScanRate', () => {
  it('returns null until enough time has elapsed', () => {
    expect(estimateScanRate(40, 200)).toBeNull();
    expect(estimateScanRate(0, 2000)).toBeNull();
  });

  it('divides processed files by elapsed seconds', () => {
    expect(estimateScanRate(100, 2000)).toBe(50);
  });
});

describe('formatScanRate', () => {
  it('rounds large rates and keeps one decimal under 10', () => {
    expect(formatScanRate(85.4)).toBe(' · ~85/s');
    expect(formatScanRate(4.21)).toBe(' · ~4.2/s');
    expect(formatScanRate(null)).toBe('');
  });
});

describe('formatPhase1ScanMessage', () => {
  it('prefixes phase one progress', () => {
    expect(
      formatPhase1ScanMessage({ label: 'Rock', index: 2, total: 5 }, 1200, 0, 85.4),
    ).toBe('Indexing paths (1/2) · Scanning Rock (2/5) · 1,200 files · ~85/s');
  });
});

describe('formatPhase2ScanMessage', () => {
  it('shows tag phase progress', () => {
    expect(formatPhase2ScanMessage(50, 200, 12.3)).toBe(
      'Reading tags (2/2) · 50/200 files · ~12/s',
    );
  });
});

describe('formatScanCompleteMessage', () => {
  it('includes skipped folder count', () => {
    expect(formatScanCompleteMessage(1200, 2)).toBe(
      'Indexed 1,200 tracks · 2 folders skipped',
    );
  });
});

describe('scan checkpoint helpers', () => {
  it('parses and seeds seen paths from completed groups', () => {
    const checkpoint = parseScanCheckpoint(
      JSON.stringify({ root: '/music', completedGroups: ['Rock'] }),
    );
    expect(checkpoint?.completedGroups).toEqual(['Rock']);
    const seen = seedSeenFromCompletedGroups(['Rock', '.'], [
      'root.mp3',
      'Rock/a.mp3',
      'Jazz/b.mp3',
    ]);
    expect([...seen]).toEqual(['Rock/a.mp3', 'root.mp3']);
    expect(groupIdForRelativePath('Rock/a.mp3')).toBe('Rock');
    expect(groupIdForRelativePath('root.mp3')).toBe('.');
    expect(pathsUnderGroup('Rock', ['Rock/a.mp3', 'Jazz/b.mp3'])).toEqual([
      'Rock/a.mp3',
    ]);
  });

  it('maps library-root paths for issue lists', () => {
    expect(displayScanPath('/mnt/music', '/mnt/music/Rock/song.mp3')).toBe(
      'Rock/song.mp3',
    );
    expect(displayScanPath('/mnt/music', '/mnt/music')).toBe('.');
  });

  it('parses persisted scan issues', () => {
    expect(
      parseScanIssues(
        JSON.stringify([
          { path: 'Rock/a.mp3', op: 'stat', message: 'EACCES' },
          { path: 1, op: 'stat', message: 'bad' },
        ]),
      ),
    ).toEqual([{ path: 'Rock/a.mp3', op: 'stat', message: 'EACCES' }]);
  });

  it('allows skipping a directory when mtime and catalogue agree', () => {
    const existing = new Map([
      ['Rock/a.mp3', { size_bytes: 10, mtime_ms: 100 }],
    ]);
    expect(
      canSkipDirectoryByMtime('Rock', 500, 500, existing),
    ).toEqual({ skip: true, seenPaths: ['Rock/a.mp3'] });
  });
});

describe('walkAudioFileChunks', () => {
  async function makeRoot(): Promise<string> {
    return mkdtemp(join(tmpdir(), 'karaokej-walk-'));
  }

  it('yields audio files grouped by top-level folder and skips junk dirs', async () => {
    const root = await makeRoot();
    await createLibraryTree(root);

    const chunks: string[][] = [];
    const folders: string[] = [];

    for await (const batch of walkAudioFileChunks(root, {
      chunkSize: 2,
      onTopLevelFolder: (progress) => folders.push(progress.label),
    })) {
      chunks.push(batch.files.map((file) => file.relativePath));
    }

    expect(folders).toHaveLength(3);
    expect(folders.slice(1)).toEqual(['Jazz', 'Rock']);
    const paths = chunks.flat();
    expect(paths).toContain('root-track.mp3');
    expect(paths).toContain('Rock/Album A/song1.mp3');
    expect(paths).not.toContain('.git/ignored.mp3');
  });

  it('yields mid-folder when chunkSize is reached before the tree is fully walked', async () => {
    const root = await makeRoot();
    await mkdir(join(root, 'Many'), { recursive: true });
    for (let i = 1; i <= 5; i += 1) {
      await writeFile(join(root, 'Many', `song${i}.mp3`), `data-${i}`);
    }

    const chunkSizes: number[] = [];
    for await (const batch of walkAudioFileChunks(root, {
      chunkSize: 2,
      completedGroups: new Set(['Jazz', 'Rock', '.']),
    })) {
      if (batch.files.length > 0) {
        chunkSizes.push(batch.files.length);
      }
    }

    expect(chunkSizes.length).toBeGreaterThan(1);
    expect(chunkSizes.reduce((sum, size) => sum + size, 0)).toBe(5);
    expect(Math.max(...chunkSizes)).toBeLessThanOrEqual(2);
  });

  it('skips completed groups when resuming', async () => {
    const root = await makeRoot();
    await createLibraryTree(root);

    const paths: string[] = [];
    for await (const batch of walkAudioFileChunks(root, {
      completedGroups: new Set(['Jazz', 'Rock']),
    })) {
      paths.push(...batch.files.map((file) => file.relativePath));
    }

    expect(paths).toEqual(['root-track.mp3']);
  });

  it('reports walk errors instead of failing silently', async () => {
    const root = await makeRoot();
    await mkdir(join(root, 'Broken'), { recursive: true });
    await writeFile(join(root, 'Broken', 'song.mp3'), 'x');
    const errors: string[] = [];

    for await (const _batch of walkAudioFileChunks(root, {
      onWalkError: (error) => errors.push(error.path),
      fsTimeoutMs: 50,
    })) {
      /* walk */
    }

    expect(errors.length).toBe(0);
  });

  it('throws on root readdir failure', async () => {
    await expect(async () => {
      for await (const _batch of walkAudioFileChunks('/no/such/library/root')) {
        void _batch;
      }
    }).rejects.toBeInstanceOf(RootReaddirError);
  });

  it('skips junk directory names', () => {
    expect(isJunkDir('.git')).toBe(true);
    expect(isJunkDir('Rock')).toBe(false);
  });

  it('detects .lrc sidecars from directory readdir without extra stat calls', async () => {
    const root = await makeRoot();
    await writeFile(join(root, 'song.mp3'), 'audio');
    await writeFile(join(root, 'song.lrc'), 'lyrics');

    const files: Array<{ relativePath: string; hasLrc: boolean }> = [];
    for await (const batch of walkAudioFileChunks(root)) {
      files.push(
        ...batch.files.map((file) => ({
          relativePath: file.relativePath,
          hasLrc: file.hasLrc,
        })),
      );
    }

    expect(files).toEqual([{ relativePath: 'song.mp3', hasLrc: true }]);
  });
});
