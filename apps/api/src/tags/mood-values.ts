import { MAX_TAGS_PER_SONG, parseTagName } from '@karaokej/shared';

interface NativeTag {
  id: string;
  value: unknown;
}

function stringsFromValue(value: unknown): string[] {
  if (typeof value === 'string') {
    return value
      .split('\0')
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => stringsFromValue(item));
  }
  return [];
}

/** Reads Mood from native ID3 TMOO and Vorbis MOOD frames, not common.mood. */
export function moodValuesFromNative(
  native: Record<string, NativeTag[]> | undefined,
): string[] {
  if (!native) {
    return [];
  }
  const values: string[] = [];
  for (const tags of Object.values(native)) {
    for (const tag of tags) {
      const id = tag.id.toUpperCase();
      if (id === 'TMOO' || id === 'MOOD') {
        values.push(...stringsFromValue(tag.value));
      }
    }
  }
  return values;
}

export interface PartitionedMoods {
  /** Valid tag names, at most 15, first occurrence kept. */
  valid: string[];
  /** Invalid text and valid names past the per-song cap, kept for write-back. */
  extra: string[];
}

export function partitionMoodValues(values: string[]): PartitionedMoods {
  const valid: string[] = [];
  const extra: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const parsed = parseTagName(raw);
    if (!parsed) {
      const trimmed = raw.trim();
      if (trimmed) {
        extra.push(trimmed);
      }
      continue;
    }
    if (seen.has(parsed.key)) {
      continue;
    }
    seen.add(parsed.key);
    if (valid.length >= MAX_TAGS_PER_SONG) {
      extra.push(parsed.name);
      continue;
    }
    valid.push(parsed.name);
  }
  return { valid, extra };
}
