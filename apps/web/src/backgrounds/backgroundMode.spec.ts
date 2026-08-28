import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ANIMATED_BACKGROUNDS,
  pickShuffledBackground,
  readBackgroundMode,
  resolveActiveBackground,
  writeBackgroundMode,
} from './backgroundMode';

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

describe('backgroundMode', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createStorageMock());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('defaults to shuffle when unset', () => {
    expect(readBackgroundMode()).toBe('shuffle');
  });

  it('persists and reads a selected mode', () => {
    writeBackgroundMode('aurora');
    expect(readBackgroundMode()).toBe('aurora');
  });

  it('falls back to shuffle for invalid stored values', () => {
    localStorage.setItem('karaokej.backgroundMode', 'invalid-mode');
    expect(readBackgroundMode()).toBe('shuffle');
  });

  it('picks a stable shuffled background per track id', () => {
    const first = pickShuffledBackground('track-42');
    const second = pickShuffledBackground('track-42');
    expect(first).toBe(second);
    expect(ANIMATED_BACKGROUNDS).toContain(first);
  });

  it('varies shuffled backgrounds across track ids', () => {
    const picks = new Set(
      ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'].map((id) =>
        pickShuffledBackground(id),
      ),
    );
    expect(picks.size).toBeGreaterThan(1);
  });

  it('resolves shuffle mode from the current track id', () => {
    const resolved = resolveActiveBackground('shuffle', '99');
    expect(resolved).toBe(pickShuffledBackground('99'));
  });

  it('returns the selected mode when not shuffling', () => {
    expect(resolveActiveBackground('gradients', '99')).toBe('gradients');
  });
});
