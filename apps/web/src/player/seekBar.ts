export interface SeekBarState {
  scrub: number | null;
  positionMs: number;
  trackDurationMs: number;
  liveAudioDurationMs: number;
}

export function seekBarMaxMs({
  trackDurationMs,
  liveAudioDurationMs,
  positionMs,
}: Omit<SeekBarState, 'scrub'>): number {
  return Math.max(trackDurationMs, liveAudioDurationMs, positionMs, 1);
}

export function seekBarDisplayedMs({
  scrub,
  positionMs,
}: Pick<SeekBarState, 'scrub' | 'positionMs'>): number {
  return scrub ?? positionMs;
}

export function seekBarDurationLabelMs({
  trackDurationMs,
  liveAudioDurationMs,
}: Pick<SeekBarState, 'trackDurationMs' | 'liveAudioDurationMs'>): number {
  return Math.max(trackDurationMs, liveAudioDurationMs);
}

export type SeekChangeAction = 'preview' | 'commit';

export function seekChangeAction(pointerDown: boolean): SeekChangeAction {
  return pointerDown ? 'preview' : 'commit';
}
