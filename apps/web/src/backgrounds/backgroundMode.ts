export const ANIMATED_BACKGROUNDS = [
  'wavemeter',
  'gradients',
  'aurora',
  'orbs',
  'starfield',
  'hue-wash',
] as const;

export type AnimatedBackground = (typeof ANIMATED_BACKGROUNDS)[number];
export type BackgroundMode = 'shuffle' | AnimatedBackground;

export const BACKGROUND_MODE_LABELS: Record<BackgroundMode, string> = {
  shuffle: 'Shuffle',
  wavemeter: 'Wavemeter',
  gradients: 'Gradients',
  aurora: 'Aurora',
  orbs: 'Orbs',
  starfield: 'Starfield',
  'hue-wash': 'Hue wash',
};

export const BACKGROUND_MODE_OPTIONS: BackgroundMode[] = [
  'shuffle',
  ...ANIMATED_BACKGROUNDS,
];

const STORAGE_KEY = 'karaokej.backgroundMode';
export const BACKGROUND_MODE_EVENT = 'karaokej:backgroundMode';

function isAnimatedBackground(value: string): value is AnimatedBackground {
  return (ANIMATED_BACKGROUNDS as readonly string[]).includes(value);
}

function isBackgroundMode(value: string): value is BackgroundMode {
  return value === 'shuffle' || isAnimatedBackground(value);
}

export function readBackgroundMode(): BackgroundMode {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw || !isBackgroundMode(raw)) {
      return 'shuffle';
    }
    return raw;
  } catch {
    return 'shuffle';
  }
}

export function writeBackgroundMode(mode: BackgroundMode): void {
  localStorage.setItem(STORAGE_KEY, mode);
  if (typeof globalThis.dispatchEvent === 'function') {
    globalThis.dispatchEvent(new CustomEvent(BACKGROUND_MODE_EVENT, { detail: mode }));
  }
}

function hashTrackId(trackId: string): number {
  let hash = 2166136261;
  for (let i = 0; i < trackId.length; i += 1) {
    hash ^= trackId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function pickShuffledBackground(trackId: string): AnimatedBackground {
  const index = hashTrackId(trackId) % ANIMATED_BACKGROUNDS.length;
  return ANIMATED_BACKGROUNDS[index];
}

export function resolveActiveBackground(
  mode: BackgroundMode,
  trackId: string | null,
): AnimatedBackground {
  if (mode === 'shuffle') {
    return pickShuffledBackground(trackId ?? 'idle');
  }
  return mode;
}
