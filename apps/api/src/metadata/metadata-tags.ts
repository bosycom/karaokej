import { AudioFormat } from '@karaokej/shared';
import { writeMp3Metadata } from '../rating/mp3-tags';
import { writeFlacMetadata } from '../rating/flac-tags';
import { writeOpusMetadata } from '../rating/opus-tags';
import type { EditableTrackMetadata } from './metadata-fields';

export async function writeMetadataToFile(
  absolutePath: string,
  format: AudioFormat,
  metadata: EditableTrackMetadata,
): Promise<void> {
  switch (format) {
    case 'mp3':
      await writeMp3Metadata(absolutePath, metadata);
      return;
    case 'flac':
      await writeFlacMetadata(absolutePath, metadata);
      return;
    case 'opus':
      await writeOpusMetadata(absolutePath, metadata);
      return;
    default:
      throw new Error(`Unsupported audio format: ${format}`);
  }
}
