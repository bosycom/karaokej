import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, insertTrack, type TestDbService } from '../test/test-db';
import {
  coverFilePath,
  pruneOrphanedCoverGroups,
  pruneUnreferencedCover,
  writeCoverFile,
} from './cover-storage';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

function addGroup(db: TestDbService, groupKey: string, hash: string): void {
  db.raw
    .prepare(
      `INSERT INTO cover_groups (group_key, status, cover_hash, source_kind, checked_at)
       VALUES (?, 'ready', ?, 'embedded', ?)`,
    )
    .run(groupKey, hash, Date.now());
  db.raw
    .prepare(
      `INSERT OR IGNORE INTO covers (hash, format, created_at) VALUES (?, 'webp', ?)`,
    )
    .run(hash, Date.now());
}

function writeBothSizes(cacheRoot: string, hash: string): void {
  writeCoverFile(cacheRoot, hash, 'sm', 'webp', Buffer.from('sm'));
  writeCoverFile(cacheRoot, hash, 'lg', 'webp', Buffer.from('lg'));
}

function filesExist(cacheRoot: string, hash: string): boolean {
  return (
    existsSync(coverFilePath(cacheRoot, hash, 'sm', 'webp')) ||
    existsSync(coverFilePath(cacheRoot, hash, 'lg', 'webp'))
  );
}

describe('cover storage', () => {
  let cacheRoot: string;
  let db: TestDbService;
  let cleanup: () => void;

  beforeEach(() => {
    cacheRoot = mkdtempSync(join(tmpdir(), 'karaokej-covers-'));
    ({ db, cleanup } = createTestDb());
  });

  afterEach(() => {
    cleanup();
    rmSync(cacheRoot, { recursive: true, force: true });
  });

  it('shards files by hash prefix and tags them with the pixel size', () => {
    const path = coverFilePath(cacheRoot, HASH_A, 'sm', 'webp');
    expect(path).toBe(join(cacheRoot, 'aa', `${HASH_A}-128.webp`));
    expect(coverFilePath(cacheRoot, HASH_A, 'lg', 'jpg')).toBe(
      join(cacheRoot, 'aa', `${HASH_A}-640.jpg`),
    );
  });

  it('keeps thumbnails while another group still references them', () => {
    writeBothSizes(cacheRoot, HASH_A);
    addGroup(db, 'group-one', HASH_A);
    addGroup(db, 'group-two', HASH_A);

    db.raw.prepare(`DELETE FROM cover_groups WHERE group_key = ?`).run('group-one');
    expect(pruneUnreferencedCover(db.raw, cacheRoot, HASH_A)).toBe(false);
    expect(filesExist(cacheRoot, HASH_A)).toBe(true);
  });

  it('removes thumbnails once the last referencing group is gone', () => {
    writeBothSizes(cacheRoot, HASH_A);
    addGroup(db, 'group-one', HASH_A);

    db.raw.prepare(`DELETE FROM cover_groups WHERE group_key = ?`).run('group-one');
    expect(pruneUnreferencedCover(db.raw, cacheRoot, HASH_A)).toBe(true);
    expect(filesExist(cacheRoot, HASH_A)).toBe(false);
    const remaining = db.raw
      .prepare(`SELECT COUNT(*) AS n FROM covers WHERE hash = ?`)
      .get(HASH_A) as { n: number };
    expect(remaining.n).toBe(0);
  });

  it('keeps a group alive while any track still points at it', () => {
    writeBothSizes(cacheRoot, HASH_A);
    addGroup(db, 'shared-group', HASH_A);
    insertTrack(db, {
      relativePath: 'Artist/Album/One.mp3',
      title: 'One',
      coverGroup: 'shared-group',
    });
    const second = insertTrack(db, {
      relativePath: 'Artist/Album/Two.mp3',
      title: 'Two',
      coverGroup: 'shared-group',
    });

    db.raw.prepare(`DELETE FROM tracks WHERE id = ?`).run(second);
    pruneOrphanedCoverGroups(db.raw, cacheRoot, ['shared-group']);

    const group = db.raw
      .prepare(`SELECT COUNT(*) AS n FROM cover_groups WHERE group_key = ?`)
      .get('shared-group') as { n: number };
    expect(group.n).toBe(1);
    expect(filesExist(cacheRoot, HASH_A)).toBe(true);
  });

  it('drops the group and its thumbnails when the last track is deleted', () => {
    writeBothSizes(cacheRoot, HASH_A);
    addGroup(db, 'solo-group', HASH_A);
    const trackId = insertTrack(db, {
      relativePath: 'Artist/Album/Only.mp3',
      title: 'Only',
      coverGroup: 'solo-group',
    });

    db.raw.prepare(`DELETE FROM tracks WHERE id = ?`).run(trackId);
    pruneOrphanedCoverGroups(db.raw, cacheRoot, ['solo-group']);

    const group = db.raw
      .prepare(`SELECT COUNT(*) AS n FROM cover_groups WHERE group_key = ?`)
      .get('solo-group') as { n: number };
    expect(group.n).toBe(0);
    expect(filesExist(cacheRoot, HASH_A)).toBe(false);
  });

  it('leaves unrelated artwork untouched', () => {
    writeBothSizes(cacheRoot, HASH_A);
    writeBothSizes(cacheRoot, HASH_B);
    addGroup(db, 'group-a', HASH_A);
    addGroup(db, 'group-b', HASH_B);

    pruneOrphanedCoverGroups(db.raw, cacheRoot, ['group-a']);
    expect(filesExist(cacheRoot, HASH_A)).toBe(false);
    expect(filesExist(cacheRoot, HASH_B)).toBe(true);
  });
});
