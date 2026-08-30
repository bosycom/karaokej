import { readdir, readFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';

export const COVER_IMAGE_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
  '.bmp',
]);

/** Ordered by how likely the name is to be the real front cover. */
const SIDECAR_BASENAMES = [
  'cover',
  'folder',
  'front',
  'albumart',
  'album',
  'artwork',
  'art',
  'thumb',
];

export function isCoverImageFile(name: string): boolean {
  return COVER_IMAGE_EXTENSIONS.has(extname(name).toLowerCase());
}

export function pickSidecarName(
  fileNames: string[],
  audioStem: string,
): string | null {
  const images = fileNames.filter(isCoverImageFile);
  if (images.length === 0) {
    return null;
  }
  const stemLower = audioStem.toLowerCase();
  const byStem = images.find(
    (name) => basename(name, extname(name)).toLowerCase() === stemLower,
  );
  if (byStem) {
    return byStem;
  }
  for (const candidate of SIDECAR_BASENAMES) {
    const match = images.find(
      (name) => basename(name, extname(name)).toLowerCase() === candidate,
    );
    if (match) {
      return match;
    }
  }
  // A folder holding exactly one image is unambiguous whatever it is called.
  return images.length === 1 ? images[0]! : null;
}

export async function findSidecarImage(
  directory: string,
  audioStem: string,
): Promise<string | null> {
  let entries: string[];
  try {
    entries = (await readdir(directory, { withFileTypes: true }))
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name);
  } catch {
    return null;
  }
  const picked = pickSidecarName(entries, audioStem);
  return picked ? join(directory, picked) : null;
}

export async function readSidecarImage(
  directory: string,
  audioStem: string,
): Promise<{ data: Buffer; path: string } | null> {
  const path = await findSidecarImage(directory, audioStem);
  if (!path) {
    return null;
  }
  try {
    return { data: await readFile(path), path };
  } catch {
    return null;
  }
}

interface PictureLike {
  data: Uint8Array;
  type?: string;
}

/** ID3 APIC labels the front cover explicitly; otherwise take the first image. */
export function pickFrontPicture<T extends PictureLike>(
  pictures: readonly T[] | undefined,
): T | null {
  if (!pictures || pictures.length === 0) {
    return null;
  }
  return pictures.find((pic) => /front/i.test(pic.type ?? '')) ?? pictures[0]!;
}

export async function readEmbeddedCover(
  absolutePath: string,
): Promise<Buffer | null> {
  try {
    const { parseFile } = await import('music-metadata');
    const metadata = await parseFile(absolutePath, {
      duration: false,
      skipCovers: false,
    });
    const picture = pickFrontPicture(metadata.common.picture);
    return picture ? Buffer.from(picture.data) : null;
  } catch {
    return null;
  }
}
