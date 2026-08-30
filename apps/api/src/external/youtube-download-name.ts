import { basename, extname, join } from 'node:path';
import { existsSync } from 'node:fs';

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

const YOUTUBE_VIDEO_ID_BODY = '[A-Za-z0-9_-]{11}';

function stripYoutubeVideoIdSuffix(stem: string): string {
  const match = stem.match(new RegExp(`\\s+\\[${YOUTUBE_VIDEO_ID_BODY}\\]$`));
  if (!match) {
    return stem;
  }
  return stem.slice(0, stem.length - match[0].length).trimEnd();
}

function stripYouTubeLyricsNoise(title: string): string {
  let result = title;

  result = result.replace(/\s*[\(\[\{]\s*Lyrics\s*[\)\]\}]\s*/gi, ' ');
  result = result.replace(/\s+Lyric\s+Video\s*/gi, ' ');

  const withoutStandalone = collapseWhitespace(
    result
      .replace(/\s+Lyrics\s+/gi, ' ')
      .replace(/^\s*Lyrics\s+/i, '')
      .replace(/\s+Lyrics\s*$/i, ''),
  );
  if (withoutStandalone) {
    result = withoutStandalone;
  }

  result = result
    .replace(/\(\s*\)/g, '')
    .replace(/\[\s*\]/g, '')
    .replace(/\{\s*\}/g, '');

  return collapseWhitespace(result);
}

/** Clean a yt-dlp download basename (with extension) for library display. */
export function cleanYoutubeDownloadBasename(filename: string): string {
  const ext = extname(filename);
  const rawStem = basename(filename, ext);
  let stem = stripYoutubeVideoIdSuffix(rawStem);
  stem = collapseWhitespace(stem.replace(/_/g, ' '));
  stem = stripYouTubeLyricsNoise(stem);
  return `${stem}${ext}`;
}

/** Pick a non-colliding basename in downloadsDir, optionally ignoring one existing file. */
export function resolveUniqueDownloadBasename(
  downloadsDir: string,
  basenameCandidate: string,
  excludeBasename?: string,
): string {
  const ext = extname(basenameCandidate);
  const stem = basename(basenameCandidate, ext);
  let candidate = basenameCandidate;
  let suffix = 2;

  while (true) {
    if (candidate === excludeBasename) {
      return candidate;
    }
    const fullPath = join(downloadsDir, candidate);
    if (!existsSync(fullPath)) {
      return candidate;
    }
    candidate = `${stem} (${suffix})${ext}`;
    suffix += 1;
  }
}
