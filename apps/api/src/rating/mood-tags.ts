import { AudioFormat } from '@karaokej/shared';
import { writeFlacMoods } from './flac-tags';
import { writeMp3Moods } from './mp3-tags';
import { writeOpusMoods } from './opus-tags';

export async function writeMoodsToFile(
  absolutePath: string,
  format: AudioFormat,
  values: string[],
): Promise<void> {
  switch (format) {
    case 'mp3':
      await writeMp3Moods(absolutePath, values);
      return;
    case 'flac':
      await writeFlacMoods(absolutePath, values);
      return;
    case 'opus':
      await writeOpusMoods(absolutePath, values);
      return;
    default:
      throw new Error(`Unsupported audio format: ${format}`);
  }
}
