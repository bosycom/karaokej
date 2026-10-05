export const MAX_TAG_NAME_LENGTH = 15;
export const MAX_TAGS_PER_SONG = 15;
export const MAX_MANAGED_TAGS = 255;

const TOKEN = /^[\p{L}\p{N}]+$/u;

export interface ParsedTagName {
  name: string;
  key: string;
}

export function tagKey(name: string): string {
  return name.toLowerCase();
}

/**
 * Accepts letters, numbers, and single spaces. Rejects punctuation, emoji,
 * and control characters. The stored key is the lowercase name.
 */
export function parseTagName(raw: string): ParsedTagName | null {
  const name = raw.trim().replace(/\s+/g, ' ');
  if (name.length < 1 || [...name].length > MAX_TAG_NAME_LENGTH) {
    return null;
  }
  const tokens = name.split(' ');
  if (!tokens.every((token) => TOKEN.test(token))) {
    return null;
  }
  return { name, key: tagKey(name) };
}

export function tagNameError(raw: string): string | null {
  if (parseTagName(raw)) {
    return null;
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return 'Enter a tag name.';
  }
  if ([...trimmed.replace(/\s+/g, ' ')].length > MAX_TAG_NAME_LENGTH) {
    return `Tag names can be at most ${MAX_TAG_NAME_LENGTH} characters.`;
  }
  return 'Use letters, numbers, and spaces only.';
}
