import { AudioFormat } from '@karaokej/shared';
import { writeFlacRating } from './flac-tags';
import { writeMp3Rating } from './mp3-tags';
import { writeOpusRating } from './opus-tags';
import {
  parseFmpsRating,
  parseVorbisRating,
  POPM_EMAIL,
  popmToInternal,
} from './rating-scale';

interface NativeTag {
  id: string;
  value: unknown;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function collectNativeRatings(native: Record<string, NativeTag[]> | undefined): {
  popm: Array<{ email: string; rating: number }>;
  vorbis: string[];
  fmps: string[];
} {
  const popm: Array<{ email: string; rating: number }> = [];
  const vorbis: string[] = [];
  const fmps: string[] = [];
  if (!native) {
    return { popm, vorbis, fmps };
  }
  for (const tags of Object.values(native)) {
    for (const tag of tags) {
      const id = tag.id.toUpperCase();
      if (id === 'POPM') {
        const rec = asRecord(tag.value);
        const rating = rec?.rating;
        if (typeof rating === 'number') {
          popm.push({
            email: typeof rec?.email === 'string' ? rec.email : '',
            rating,
          });
        }
        continue;
      }
      if (id === 'RATING') {
        if (typeof tag.value === 'string' || typeof tag.value === 'number') {
          vorbis.push(String(tag.value));
        }
        continue;
      }
      if (id === 'FMPS_RATING' || id === 'TXXX:FMPS_RATING') {
        if (typeof tag.value === 'string' || typeof tag.value === 'number') {
          fmps.push(String(tag.value));
        }
        continue;
      }
      if (id === 'TXXX') {
        const rec = asRecord(tag.value);
        const description = String(rec?.description ?? rec?.id ?? '').toUpperCase();
        const text = rec?.text ?? rec?.value;
        if (description === 'FMPS_RATING' && (typeof text === 'string' || typeof text === 'number')) {
          fmps.push(String(text));
        }
      }
    }
  }
  return { popm, vorbis, fmps };
}

export function ratingFromMetadata(meta: {
  native?: Record<string, NativeTag[]>;
  common: { rating?: Array<{ rating?: number }> };
}): number {
  const collected = collectNativeRatings(meta.native);

  if (collected.popm.length > 0) {
    const preferred =
      collected.popm.find(
        (entry) => entry.email.toLowerCase() === POPM_EMAIL.toLowerCase(),
      ) ?? collected.popm[0];
    return popmToInternal(preferred.rating);
  }

  for (const raw of collected.vorbis) {
    const parsed = parseVorbisRating(raw);
    if (parsed != null) {
      return parsed;
    }
  }

  for (const raw of collected.fmps) {
    const parsed = parseFmpsRating(raw);
    if (parsed != null) {
      return parsed;
    }
  }

  const common = meta.common.rating?.find((entry) => entry.rating != null);
  if (common?.rating != null) {
    return Math.min(10, Math.max(0, Math.round(common.rating * 10)));
  }

  return 0;
}

export async function readRatingFromFile(absolutePath: string): Promise<number> {
  const { parseFile } = await import('music-metadata');
  const meta = await parseFile(absolutePath, {
    duration: false,
    skipCovers: true,
  });
  return ratingFromMetadata(meta);
}

export async function writeRatingToFile(
  absolutePath: string,
  format: AudioFormat,
  rating: number,
): Promise<void> {
  switch (format) {
    case 'mp3':
      await writeMp3Rating(absolutePath, rating);
      return;
    case 'flac':
      await writeFlacRating(absolutePath, rating);
      return;
    case 'opus':
      await writeOpusRating(absolutePath, rating);
      return;
    default:
      throw new Error(`Unsupported audio format: ${format}`);
  }
}
