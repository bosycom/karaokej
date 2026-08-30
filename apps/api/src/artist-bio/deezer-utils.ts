export interface DeezerArtistHit {
  id: number;
  name: string;
}

export interface DeezerTrackHit {
  title: string | null;
}

export function pickDeezerArtist(
  artists: DeezerArtistHit[],
  queryName: string,
): DeezerArtistHit | null {
  if (artists.length === 0) {
    return null;
  }
  const normalizedQuery = queryName.trim().toLowerCase();
  const exact = artists.find(
    (artist) => artist.name.trim().toLowerCase() === normalizedQuery,
  );
  return exact ?? artists[0] ?? null;
}

export function mapDeezerTopTracks(
  tracks: DeezerTrackHit[],
  limit = 10,
): { name: string }[] {
  const names: { name: string }[] = [];
  for (const track of tracks) {
    const name = track.title?.trim();
    if (!name) {
      continue;
    }
    names.push({ name });
    if (names.length >= limit) {
      break;
    }
  }
  return names;
}
