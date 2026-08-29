import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clampUiScale,
  formatUiScale,
  readUiScale,
  stepUiScale,
  UI_SCALE_DEFAULT,
  UI_SCALE_MAX,
  UI_SCALE_MIN,
  writeUiScale,
} from './uiScale';

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

describe('uiScale', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createStorageMock());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('defaults to 100% when unset', () => {
    expect(readUiScale()).toBe(UI_SCALE_DEFAULT);
  });

  it('persists and reads a selected scale', () => {
    writeUiScale(1.2);
    expect(readUiScale()).toBe(1.2);
  });

  it('clamps invalid and out-of-range values', () => {
    expect(clampUiScale(Number.NaN)).toBe(UI_SCALE_DEFAULT);
    expect(clampUiScale(0.2)).toBe(UI_SCALE_MIN);
    expect(clampUiScale(3)).toBe(UI_SCALE_MAX);
    localStorage.setItem('karaokej.uiScale', 'not-a-number');
    expect(readUiScale()).toBe(UI_SCALE_DEFAULT);
  });

  it('steps up and down in 10% increments', () => {
    expect(stepUiScale(1, 1)).toBe(1.1);
    expect(stepUiScale(1, -1)).toBe(0.9);
    expect(stepUiScale(UI_SCALE_MIN, -1)).toBe(UI_SCALE_MIN);
    expect(stepUiScale(UI_SCALE_MAX, 1)).toBe(UI_SCALE_MAX);
  });

  it('formats the current scale as a percent', () => {
    expect(formatUiScale(1)).toBe('100%');
    expect(formatUiScale(0.8)).toBe('80%');
  });
});
