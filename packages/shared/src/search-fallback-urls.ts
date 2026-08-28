export interface PlatformSearchUrls {
  youtube: string;
  spotify: string;
  vimeo: string;
}

export function buildPlatformSearchUrls(query: string): PlatformSearchUrls {
  const q = encodeURIComponent(query.trim());
  return {
    youtube: `https://www.youtube.com/results?search_query=${q}`,
    spotify: `https://open.spotify.com/search/${q}`,
    vimeo: `https://vimeo.com/search?q=${q}`,
  };
}
