import { randomBytes } from 'node:crypto';
import { copyFile, open, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';

const BACKUP_SUFFIX = '.karaokej-bak';
const REGION_BACKUP_SUFFIX = '.karaokej-bak-region';
const TEMP_SUFFIX = '.karaokej-tmp';
const COPY_CHUNK_BYTES = 1024 * 1024;

/**
 * fsync is not implemented on every remote filesystem (the library often lives on an
 * SMB share via drvfs). Those refusals say nothing about whether the write landed.
 */
const OPTIONAL_SYNC_CODES = new Set([
  'EINVAL',
  'ENOSYS',
  'ENOTSUP',
  'EOPNOTSUPP',
  'EPERM',
  'EBADF',
]);

export interface SafeWriteOptions {
  /**
   * Runs against the finished target. Throwing rolls the write back, so this is the
   * last line of defence against leaving behind a file the decoders cannot read.
   */
  verify?: (targetPath: string) => Promise<void>;
}

const writeQueues = new Map<string, Promise<unknown>>();

/**
 * Serialises writes per path. Two concurrent writers would otherwise back up each
 * other's half-written content and restore the wrong bytes on failure.
 */
function withPathLock<T>(path: string, run: () => Promise<T>): Promise<T> {
  const previous = writeQueues.get(path) ?? Promise.resolve();
  const result = previous.then(run, run);
  const tracked: Promise<void> = result.then(
    () => {
      if (writeQueues.get(path) === tracked) {
        writeQueues.delete(path);
      }
    },
    () => {
      if (writeQueues.get(path) === tracked) {
        writeQueues.delete(path);
      }
    },
  );
  writeQueues.set(path, tracked);
  return result;
}

function errorCode(err: unknown): string | undefined {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as NodeJS.ErrnoException).code;
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}

async function syncIfSupported(handle: FileHandle): Promise<void> {
  try {
    await handle.sync();
  } catch (err) {
    if (!OPTIONAL_SYNC_CODES.has(errorCode(err) ?? '')) {
      throw err;
    }
  }
}

/**
 * Writes into an existing file through `r+`. The directory entry is never renamed,
 * replaced or unlinked, so open readers keep a valid handle and the file can never
 * end up in a delete-pending state on an SMB share.
 */
async function writeInPlace(
  targetPath: string,
  data: Buffer,
  offset: number,
  truncateTo: number | null,
): Promise<void> {
  const handle = await open(targetPath, 'r+');
  try {
    await handle.write(data, 0, data.length, offset);
    if (truncateTo != null) {
      await handle.truncate(truncateTo);
    }
    await syncIfSupported(handle);
  } finally {
    await handle.close();
  }
}

async function copyInPlace(
  sourcePath: string,
  targetPath: string,
  size: number,
): Promise<void> {
  const source = await open(sourcePath, 'r');
  try {
    const target = await open(targetPath, 'r+');
    try {
      const buffer = Buffer.allocUnsafe(Math.min(COPY_CHUNK_BYTES, Math.max(size, 1)));
      let offset = 0;
      while (offset < size) {
        const { bytesRead } = await source.read(buffer, 0, buffer.length, offset);
        if (bytesRead <= 0) {
          break;
        }
        await target.write(buffer, 0, bytesRead, offset);
        offset += bytesRead;
      }
      if (offset !== size) {
        throw new Error(
          `Copied ${offset} of ${size} bytes into ${targetPath}`,
        );
      }
      await target.truncate(size);
      await syncIfSupported(target);
    } finally {
      await target.close();
    }
  } finally {
    await source.close();
  }
}

async function readRegion(
  targetPath: string,
  offset: number,
  length: number,
): Promise<Buffer> {
  const handle = await open(targetPath, 'r');
  try {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, offset);
    if (bytesRead !== length) {
      throw new Error(
        `Read ${bytesRead} of ${length} bytes from ${targetPath} at ${offset}`,
      );
    }
    return buffer;
  } finally {
    await handle.close();
  }
}

async function backupWholeFile(targetPath: string): Promise<{
  backupPath: string;
  size: number;
}> {
  const original = await stat(targetPath);
  const backupPath = `${targetPath}${BACKUP_SUFFIX}`;
  await copyFile(targetPath, backupPath);
  const copy = await stat(backupPath);
  if (copy.size !== original.size) {
    await unlink(backupPath).catch(() => undefined);
    throw new Error(
      `Backup of ${targetPath} is incomplete (${copy.size} of ${original.size} bytes); the file was left untouched`,
    );
  }
  return { backupPath, size: original.size };
}

async function verifyTarget(
  targetPath: string,
  expectedSize: number,
  verify: SafeWriteOptions['verify'],
): Promise<void> {
  const info = await stat(targetPath);
  if (info.size !== expectedSize) {
    throw new Error(
      `${targetPath} is ${info.size} bytes after the write, expected ${expectedSize}`,
    );
  }
  if (verify) {
    await verify(targetPath);
  }
}

/**
 * Puts the original bytes back. Resolves to true when the target is provably intact
 * again, in which case the backup is no longer needed.
 */
async function restore(
  targetPath: string,
  backupPath: string,
  offset: number,
  truncate: boolean,
): Promise<boolean> {
  try {
    const original = await readFile(backupPath);
    await writeInPlace(targetPath, original, offset, truncate ? original.length : null);
    const restored = await readRegion(targetPath, offset, original.length);
    if (!restored.equals(original)) {
      return false;
    }
    await unlink(backupPath).catch(() => undefined);
    return true;
  } catch {
    return false;
  }
}

function rollbackError(
  targetPath: string,
  backupPath: string,
  restored: boolean,
  cause: unknown,
): Error {
  const detail = restored
    ? 'the original content was restored'
    : `the original content is preserved in ${backupPath} and must be restored by hand`;
  return new Error(`Failed to update ${targetPath}: ${detail}`, { cause });
}

/**
 * Replaces the whole file with `data`, keeping a verified backup until the new
 * content has been checked.
 */
export async function safeReplaceWithBuffer(
  targetPath: string,
  data: Buffer,
  options: SafeWriteOptions = {},
): Promise<void> {
  if (data.length === 0) {
    throw new Error(`Refusing to write an empty file to ${targetPath}`);
  }
  await withPathLock(targetPath, async () => {
    const { backupPath } = await backupWholeFile(targetPath);
    try {
      await writeInPlace(targetPath, data, 0, data.length);
      await verifyTarget(targetPath, data.length, options.verify);
    } catch (err) {
      const restored = await restore(targetPath, backupPath, 0, true);
      throw rollbackError(targetPath, backupPath, restored, err);
    }
    await unlink(backupPath).catch(() => undefined);
  });
}

/**
 * For content that has to be produced by reading the target itself (rebuilding a
 * FLAC header while streaming its audio frames): the new file is materialised in a
 * sibling temp first, then copied into the target in place.
 */
export async function safeReplaceWithTempFile(
  targetPath: string,
  writeTemp: (tempPath: string) => Promise<void>,
  options: SafeWriteOptions = {},
): Promise<void> {
  await withPathLock(targetPath, async () => {
    const tempPath = `${targetPath}${TEMP_SUFFIX}-${process.pid}-${randomBytes(4).toString('hex')}`;
    let tempIsOnlyCopy = false;
    try {
      await writeTemp(tempPath);
      const temp = await stat(tempPath);
      if (temp.size === 0) {
        throw new Error(`Refusing to write an empty file to ${targetPath}`);
      }
      const { backupPath } = await backupWholeFile(targetPath);
      try {
        await copyInPlace(tempPath, targetPath, temp.size);
        await verifyTarget(targetPath, temp.size, options.verify);
      } catch (err) {
        const restored = await restore(targetPath, backupPath, 0, true);
        tempIsOnlyCopy = !restored;
        throw rollbackError(targetPath, backupPath, restored, err);
      }
      await unlink(backupPath).catch(() => undefined);
    } finally {
      if (!tempIsOnlyCopy) {
        await unlink(tempPath).catch(() => undefined);
      }
    }
  });
}

/**
 * Overwrites `region.length` bytes at `offset` without changing the file length, so
 * audio byte offsets, `Content-Length` and range requests all stay valid while the
 * file is being streamed.
 */
export async function safePatchRegion(
  targetPath: string,
  region: Buffer,
  offset: number,
  options: SafeWriteOptions = {},
): Promise<void> {
  await withPathLock(targetPath, async () => {
    const original = await stat(targetPath);
    if (offset + region.length > original.size) {
      throw new Error(
        `Patch of ${region.length} bytes at ${offset} would extend ${targetPath} beyond ${original.size} bytes`,
      );
    }
    const backupPath = `${targetPath}${REGION_BACKUP_SUFFIX}`;
    await writeFile(backupPath, await readRegion(targetPath, offset, region.length));
    try {
      await writeInPlace(targetPath, region, offset, null);
      const written = await readRegion(targetPath, offset, region.length);
      if (!written.equals(region)) {
        throw new Error(`${targetPath} does not read back the bytes just written`);
      }
      await verifyTarget(targetPath, original.size, options.verify);
    } catch (err) {
      const restored = await restore(targetPath, backupPath, offset, false);
      throw rollbackError(targetPath, backupPath, restored, err);
    }
    await unlink(backupPath).catch(() => undefined);
  });
}
