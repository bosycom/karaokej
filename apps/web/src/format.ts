export function formatDuration(ms: number | null | undefined): string {
  if (!ms || ms < 0) {
    return '–:––';
  }
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function lyricBadge(status: string): { label: string; tone: string } {
  switch (status) {
    case 'present':
      return { label: 'Lyrics', tone: 'ok' };
    case 'instrumental':
      return { label: 'Instrumental', tone: 'muted' };
    case 'not_found':
      return { label: 'No lyrics', tone: 'warn' };
    case 'error':
      return { label: 'Lyric error', tone: 'warn' };
    default:
      return { label: 'Missing', tone: 'muted' };
  }
}
