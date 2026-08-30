import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  SEARCH_HISTORY_LIMIT,
  addSearchHistoryTerm,
  clearSearchHistory,
  readSearchHistory,
} from './searchHistory';

function createStorageMock(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return [...store.keys()][index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
  };
}

describe('searchHistory', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createStorageMock());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('starts empty', () => {
    expect(readSearchHistory()).toEqual([]);
  });

  it('prepends terms and keeps the newest first', () => {
    addSearchHistoryTerm('abba');
    addSearchHistoryTerm('queen');
    expect(readSearchHistory()).toEqual(['queen', 'abba']);
  });

  it('adds a duplicate when the same term is searched again', () => {
    addSearchHistoryTerm('abba');
    addSearchHistoryTerm('abba');
    expect(readSearchHistory()).toEqual(['abba', 'abba']);
  });

  it('ignores blank terms', () => {
    addSearchHistoryTerm('   ');
    expect(readSearchHistory()).toEqual([]);
  });

  it('caps the list at the recent limit', () => {
    for (let i = 1; i <= SEARCH_HISTORY_LIMIT + 3; i += 1) {
      addSearchHistoryTerm(`term-${i}`);
    }
    const history = readSearchHistory();
    expect(history).toHaveLength(SEARCH_HISTORY_LIMIT);
    expect(history[0]).toBe(`term-${SEARCH_HISTORY_LIMIT + 3}`);
    expect(history.at(-1)).toBe('term-4');
  });

  it('falls back to an empty list for invalid stored values', () => {
    localStorage.setItem('karaokej.searchHistory', '{not-json');
    expect(readSearchHistory()).toEqual([]);
  });

  it('clears stored history', () => {
    addSearchHistoryTerm('abba');
    addSearchHistoryTerm('queen');
    clearSearchHistory();
    expect(readSearchHistory()).toEqual([]);
    expect(localStorage.getItem('karaokej.searchHistory')).toBeNull();
  });
});
