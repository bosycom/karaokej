export const SEARCH_HISTORY_LIMIT = 10;
const STORAGE_KEY = 'karaokej.searchHistory';

export function readSearchHistory(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter((item): item is string => typeof item === 'string' && item.trim() !== '')
      .slice(0, SEARCH_HISTORY_LIMIT);
  } catch {
    return [];
  }
}

export function addSearchHistoryTerm(term: string): string[] {
  const trimmed = term.trim();
  if (!trimmed) {
    return readSearchHistory();
  }
  const next = [trimmed, ...readSearchHistory()].slice(0, SEARCH_HISTORY_LIMIT);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* quota / private mode */
  }
  return next;
}
