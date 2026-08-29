const STORAGE_KEY = 'karaokej.uiScale';
export const UI_SCALE_EVENT = 'karaokej:uiScale';

export const UI_SCALE_MIN = 0.7;
export const UI_SCALE_MAX = 1.5;
export const UI_SCALE_STEP = 0.1;
export const UI_SCALE_DEFAULT = 1;

export function clampUiScale(value: number): number {
  if (!Number.isFinite(value)) {
    return UI_SCALE_DEFAULT;
  }
  const stepped = Math.round(value / UI_SCALE_STEP) * UI_SCALE_STEP;
  const clamped = Math.min(UI_SCALE_MAX, Math.max(UI_SCALE_MIN, stepped));
  return Math.round(clamped * 10) / 10;
}

export function stepUiScale(current: number, direction: 1 | -1): number {
  return clampUiScale(current + direction * UI_SCALE_STEP);
}

export function formatUiScale(scale: number): string {
  return `${Math.round(clampUiScale(scale) * 100)}%`;
}

export function readUiScale(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw == null || raw === '') {
      return UI_SCALE_DEFAULT;
    }
    return clampUiScale(Number(raw));
  } catch {
    return UI_SCALE_DEFAULT;
  }
}

export function applyUiScale(scale: number): void {
  if (typeof document === 'undefined') {
    return;
  }
  const next = clampUiScale(scale);
  document.documentElement.style.setProperty('--ui-scale', String(next));
}

export function writeUiScale(scale: number): number {
  const next = clampUiScale(scale);
  try {
    localStorage.setItem(STORAGE_KEY, String(next));
  } catch {
    /* quota / private mode */
  }
  applyUiScale(next);
  if (typeof globalThis.dispatchEvent === 'function') {
    globalThis.dispatchEvent(new CustomEvent(UI_SCALE_EVENT, { detail: next }));
  }
  return next;
}
