import { open, readFile } from 'node:fs/promises';
import NodeID3 from 'node-id3';
import {
  hasMpegFrameSync,
  padId3Tag,
  readId3Region,
  withReservedTagPadding,
} from './id3-region';
import { safePatchRegion, safeReplaceWithBuffer } from './safe-file-write';
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

/**
 * Confirms the tag area still declares `tagBytes` and that the first audio frame
 * begins exactly where it did, which is what keeps in-flight range requests valid.
 */
function verifyTagArea(tagBytes: number): (path: string) => Promise<void> {
  return async (path: string) => {
    const handle = await open(path, 'r');
    try {
      const head = Buffer.alloc(tagBytes + 2);
      const { bytesRead } = await handle.read(head, 0, head.length, 0);
      const region = readId3Region(head.subarray(0, bytesRead));
      if (!region || region.totalBytes !== tagBytes) {
        throw new Error(`${path} no longer declares a ${tagBytes} byte ID3v2 tag`);
      }
      if (bytesRead > tagBytes && !hasMpegFrameSync(head, tagBytes)) {
        throw new Error(`${path} has no MPEG frame at offset ${tagBytes}`);
      }
    } finally {
      await handle.close();
    }
  };
}

async function applyMp3Tags(
  absolutePath: string,
  buildTags: (existing: NodeID3.Tags) => NodeID3.Tags,
): Promise<void> {
  const original = await readFile(absolutePath);
  const updated = NodeID3.update(buildTags(NodeID3.read(original)), original);
  if (updated instanceof Error) {
    throw updated;
  }

  const existing = readId3Region(original);
  const next = readId3Region(updated);

  // The audio frames are identical in both buffers, so as long as the new tag fits
  // the existing tag area we only have to rewrite that area. Nothing moves, and a
  // client streaming the file keeps reading valid audio at unchanged offsets.
  if (existing && next && next.totalBytes <= existing.totalBytes) {
    const padded = padId3Tag(
      updated.subarray(0, next.totalBytes),
      existing.totalBytes,
    );
    if (padded) {
      await safePatchRegion(absolutePath, padded, 0, {
        verify: verifyTagArea(existing.totalBytes),
      });
      return;
    }
  }

  const grown = withReservedTagPadding(updated);
  const grownRegion = readId3Region(grown);
  await safeReplaceWithBuffer(absolutePath, grown, {
    verify: grownRegion ? verifyTagArea(grownRegion.totalBytes) : undefined,
  });
}

export async function writeMp3Metadata(
  absolutePath: string,
  metadata: EditableTrackMetadata,
): Promise<void> {
  await applyMp3Tags(absolutePath, (existing) =>
    mp3TagPayload(metadata, existing.popularimeter?.counter ?? 0),
  );
}

export async function writeMp3Rating(
  absolutePath: string,
  rating: number,
): Promise<void> {
  await applyMp3Tags(absolutePath, (existing) => ({
    popularimeter: {
      email: POPM_EMAIL,
      rating: internalToPopm(rating),
      counter: existing.popularimeter?.counter ?? 0,
    },
  }));
}
