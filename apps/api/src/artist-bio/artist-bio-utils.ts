export const BIOGRAPHY_MAX_CHARS = 65_535;

const VARIOUS_ARTISTS = new Set([
  'various artists',
  'va',
  'unknown',
]);

const FEAT_PATTERN =
  /\s+(?:\(?(?:feat\.?|ft\.?|featuring)\.?\s+[^)]+?\)?)$/i;

export function normalizeArtistName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function mbidLookupKey(mbid: string): string {
  return `mbid:${mbid.trim().toLowerCase()}`;
}

export function nameLookupKey(name: string): string {
  return `name:${normalizeArtistName(name)}`;
}

export function isVariousArtist(name: string | null | undefined): boolean {
  if (!name?.trim()) {
    return true;
  }
  return VARIOUS_ARTISTS.has(normalizeArtistName(name));
}

export function stripFeaturing(name: string): string {
  return name.replace(FEAT_PATTERN, '').trim();
}

export function stripLeadingThe(name: string): string {
  return name.replace(/^the\s+/i, '').trim();
}

export function preferredArtistName(track: {
  artist: string | null;
  albumArtist?: string | null;
  album_artist?: string | null;
}): string | null {
  const albumArtist =
    track.albumArtist?.trim() ?? track.album_artist?.trim() ?? '';
  const artist = track.artist?.trim() ?? '';
  if (albumArtist && !isVariousArtist(albumArtist)) {
    return stripFeaturing(albumArtist);
  }
  if (artist) {
    return stripFeaturing(artist);
  }
  return null;
}

export function localArtistChoices(track: {
  artist: string | null;
  albumArtist?: string | null;
  album_artist?: string | null;
}): string[] {
  const names = new Set<string>();
  const albumArtist =
    track.albumArtist?.trim() ?? track.album_artist?.trim() ?? '';
  const artist = track.artist?.trim() ?? '';
  if (albumArtist && !isVariousArtist(albumArtist)) {
    names.add(stripFeaturing(albumArtist));
  }
  if (artist && !isVariousArtist(artist)) {
    names.add(stripFeaturing(artist));
  }
  return [...names].filter((a, i, arr) => arr.indexOf(a) === i);
}

export function hasLocalArtistAmbiguity(track: {
  artist: string | null;
  albumArtist?: string | null;
  album_artist?: string | null;
}): boolean {
  const choices = localArtistChoices(track);
  return choices.length > 1;
}

export function searchNameVariants(name: string): string[] {
  const trimmed = stripFeaturing(name.trim());
  if (!trimmed) {
    return [];
  }
  const variants = [trimmed];
  const withoutThe = stripLeadingThe(trimmed);
  if (withoutThe && withoutThe !== trimmed) {
    variants.push(withoutThe);
  }
  return variants;
}

export function truncateBiography(text: string): string {
  if (text.length <= BIOGRAPHY_MAX_CHARS) {
    return text;
  }
  return `${text.slice(0, BIOGRAPHY_MAX_CHARS - 1)}…`;
}

export function biographyFromArtistRecord(record: Record<string, unknown>): string | null {
  const en = record.strBiographyEN;
  const base = record.strBiography;
  const value =
    (typeof en === 'string' && en.trim()) ||
    (typeof base === 'string' && base.trim()) ||
    '';
  return value ? truncateBiography(value.trim()) : null;
}

export function stringField(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed || null;
}
