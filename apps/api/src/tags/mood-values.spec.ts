import { describe, expect, it } from 'vitest';
import { parseTagName, tagNameError } from '@karaokej/shared';
import { partitionMoodValues } from './mood-values';

describe('parseTagName', () => {
  it('accepts letters, numbers, and single spaces', () => {
    expect(parseTagName('  Party 80s ')).toEqual({ name: 'Party 80s', key: 'party 80s' });
    expect(parseTagName('café')).toEqual({ name: 'café', key: 'café' });
  });

  it('rejects punctuation, emoji, and long names', () => {
    expect(parseTagName('high-energy')).toBeNull();
    expect(parseTagName('party!')).toBeNull();
    expect(parseTagName('😀')).toBeNull();
    expect(parseTagName('a'.repeat(16))).toBeNull();
    expect(tagNameError('party!')).toMatch(/letters/i);
  });

  it('treats case as the same tag', () => {
    expect(parseTagName('Party')?.key).toBe(parseTagName('party')?.key);
  });
});

describe('partitionMoodValues', () => {
  it('keeps invalid mood text for write-back and caps valid names', () => {
    const names = Array.from({ length: 16 }, (_, index) => `M${index}`);
    const partitioned = partitionMoodValues([...names, 'high-energy']);
    expect(partitioned.valid).toHaveLength(15);
    expect(partitioned.extra).toEqual(['M15', 'high-energy']);
  });
});
