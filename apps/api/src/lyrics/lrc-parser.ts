export interface LyricLine {
  timeMs: number;
  text: string;
}

/** Line-level LRC parser. Ignores word-level enhanced timestamps. */
export function parseLrc(content: string): LyricLine[] {
  if (!content || typeof content !== 'string') {
    return [];
  }

  const timestamp = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
  const lines: LyricLine[] = [];

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('[ti:') || line.startsWith('[ar:') || line.startsWith('[al:') || line.startsWith('[by:') || line.startsWith('[offset:') || line.startsWith('[length:')) {
      continue;
    }

    const stamps: number[] = [];
    timestamp.lastIndex = 0;
    let match: RegExpExecArray | null;
    let lastIndex = 0;
    while ((match = timestamp.exec(line))) {
      const minutes = Number(match[1]);
      const seconds = Number(match[2]);
      const fraction = match[3] ?? '0';
      const fractionMs =
        fraction.length === 1
          ? Number(fraction) * 100
          : fraction.length === 2
            ? Number(fraction) * 10
            : Number(fraction.slice(0, 3));
      stamps.push(minutes * 60_000 + seconds * 1000 + fractionMs);
      lastIndex = match.index + match[0].length;
    }
    if (stamps.length === 0) {
      continue;
    }

    let text = line.slice(lastIndex).trim();
    text = text.replace(/<\d{1,3}:\d{2}(?:[.:]\d{1,3})?>/g, '').trim();
    if (!text) {
      continue;
    }

    for (const timeMs of stamps) {
      if (Number.isFinite(timeMs)) {
        lines.push({ timeMs, text });
      }
    }
  }

  lines.sort((a, b) => a.timeMs - b.timeMs);
  return lines;
}
