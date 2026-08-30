import { createHash } from 'node:crypto';
import { normalizeToken } from '../library/fs-utils';

const DISC_SUFFIX =
  /\s*[([]?\s*(?:disc|disk|cd|volume|vol)\s*\.?\s*\d+\s*[)\]]?\s*$/i;

export function coverDirname(relativePath: string): string {
  const parts = relativePath.split(/[/\\]/).filter(Boolean);
  parts.pop();
  return parts.join('/');
}

/**
 * Album titles differing only by a disc marker share one cover, so multi-disc
 * sets resolve to a single group instead of one per disc.
 */
export function normalizeAlbumForGrouping(album: string | null | undefined): string {
  const stripped = (album ?? '').replace(DISC_SUFFIX, '');
  return normalizeToken(stripped);
}

/**
 * Album artist is deliberately excluded so a compilation in one folder stays a
 * single group rather than splitting per track artist.
 */
export function coverGroupKey(
  relativePath: string,
  album: string | null | undefined,
): string {
  const dir =
    coverDirname(relativePath)
      .split('/')
      .map((segment) => normalizeToken(segment))
      .join('/') || '.';
  const albumPart = normalizeAlbumForGrouping(album);
  return createHash('sha1')
    .update(`${dir}\u001f${albumPart}`)
    .digest('hex')
    .slice(0, 16);
}
