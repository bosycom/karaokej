import { rename, unlink } from 'node:fs/promises';

export async function atomicReplace(
  targetPath: string,
  writeTemp: (tempPath: string) => Promise<void>,
): Promise<void> {
  const tempPath = `${targetPath}.rating.tmp`;
  try {
    await writeTemp(tempPath);
    await rename(tempPath, targetPath);
  } catch (err) {
    await unlink(tempPath).catch(() => undefined);
    throw err;
  }
}
