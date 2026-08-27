import { readFile, writeFile } from 'node:fs/promises';
import NodeID3 from 'node-id3';
import { atomicReplace } from './atomic-replace';
import { internalToPopm, POPM_EMAIL } from './rating-scale';

export async function writeMp3Rating(
  absolutePath: string,
  rating: number,
): Promise<void> {
  const original = await readFile(absolutePath);
  const existing = NodeID3.read(original);
  const updated = NodeID3.update(
    {
      popularimeter: {
        email: POPM_EMAIL,
        rating: internalToPopm(rating),
        counter: existing.popularimeter?.counter ?? 0,
      },
    },
    original,
  );
  if (updated instanceof Error) {
    throw updated;
  }
  await atomicReplace(absolutePath, async (tempPath) => {
    await writeFile(tempPath, updated);
  });
}
