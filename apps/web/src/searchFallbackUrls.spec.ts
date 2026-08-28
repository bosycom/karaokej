import { describe, expect, it } from 'vitest';
import { buildPlatformSearchUrls } from '@karaokej/shared';

describe('buildPlatformSearchUrls', () => {
  it('builds prefilled search URLs for each platform', () => {
    expect(buildPlatformSearchUrls('hello world')).toEqual({
      youtube: 'https://www.youtube.com/results?search_query=hello%20world',
      spotify: 'https://open.spotify.com/search/hello%20world',
      vimeo: 'https://vimeo.com/search?q=hello%20world',
    });
  });

  it('encodes special characters', () => {
    const urls = buildPlatformSearchUrls('a&b c');
    expect(urls.youtube).toBe(
      'https://www.youtube.com/results?search_query=a%26b%20c',
    );
    expect(urls.spotify).toBe('https://open.spotify.com/search/a%26b%20c');
    expect(urls.vimeo).toBe('https://vimeo.com/search?q=a%26b%20c');
  });

  it('encodes unicode', () => {
    const urls = buildPlatformSearchUrls('café');
    expect(urls.youtube).toContain('caf%C3%A9');
    expect(urls.spotify).toContain('caf%C3%A9');
    expect(urls.vimeo).toContain('caf%C3%A9');
  });

  it('trims surrounding whitespace', () => {
    expect(buildPlatformSearchUrls('  trim me  ').youtube).toBe(
      'https://www.youtube.com/results?search_query=trim%20me',
    );
  });
});
