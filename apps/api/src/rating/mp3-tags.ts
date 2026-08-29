import { readFile, writeFile } from 'node:fs/promises';
import NodeID3 from 'node-id3';
import { atomicReplace } from './atomic-replace';
import type { EditableTrackMetadata } from '../metadata/metadata-fields';
import { internalToPopm, POPM_EMAIL } from './rating-scale';

function mp3TagPayload(
  metadata: EditableTrackMetadata,
  existingCounter: number,
): NodeID3.Tags {
  return {
    title: metadata.title,
    artist: metadata.artist ?? undefined,
    album: metadata.album ?? undefined,
    performerInfo: metadata.albumArtist ?? undefined,
    trackNumber:
      metadata.trackNo != null ? String(metadata.trackNo) : undefined,
    year: metadata.year != null ? String(metadata.year) : undefined,
    genre: metadata.genres.length > 0 ? metadata.genres.join(';') : undefined,
    popularimeter: {
      email: POPM_EMAIL,
      rating: internalToPopm(metadata.rating),
      counter: existingCounter,
    },
  };
}

export async function writeMp3Metadata(
  absolutePath: string,
  metadata: EditableTrackMetadata,
): Promise<void> {
  const original = await readFile(absolutePath);
  const existing = NodeID3.read(original);
  const updated = NodeID3.update(
    mp3TagPayload(metadata, existing.popularimeter?.counter ?? 0),
    original,
  );
  if (updated instanceof Error) {
    throw updated;
  }
  await atomicReplace(absolutePath, async (tempPath) => {
    await writeFile(tempPath, updated);
  });
}

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
