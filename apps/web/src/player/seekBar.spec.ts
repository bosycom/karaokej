import { describe, expect, it } from 'vitest';
import {
  seekBarDisplayedMs,
  seekBarDurationLabelMs,
  seekBarMaxMs,
  seekChangeAction,
} from './seekBar';

describe('seekBarMaxMs', () => {
  it('uses at least 1 when no durations are known', () => {
    expect(
      seekBarMaxMs({ trackDurationMs: 0, liveAudioDurationMs: 0, positionMs: 0 }),
    ).toBe(1);
  });

  it('extends past metadata duration when live audio is longer', () => {
    expect(
      seekBarMaxMs({
        trackDurationMs: 187_000,
        liveAudioDurationMs: 213_629,
        positionMs: 50_000,
      }),
    ).toBe(213_629);
  });

  it('extends past metadata when position exceeds tag duration', () => {
    expect(
      seekBarMaxMs({
        trackDurationMs: 187_000,
        liveAudioDurationMs: 0,
        positionMs: 200_000,
      }),
    ).toBe(200_000);
  });
});

describe('seekBarDisplayedMs', () => {
  it('prefers scrub while dragging', () => {
    expect(seekBarDisplayedMs({ scrub: 187_039, positionMs: 50_000 })).toBe(187_039);
  });

  it('follows position when not scrubbing', () => {
    expect(seekBarDisplayedMs({ scrub: null, positionMs: 188_500 })).toBe(188_500);
  });

  it('does not cap position at metadata duration', () => {
    expect(seekBarDisplayedMs({ scrub: null, positionMs: 200_000 })).toBe(200_000);
  });
});

describe('seekBarDurationLabelMs', () => {
  it('shows the longer of tag and live duration', () => {
    expect(
      seekBarDurationLabelMs({ trackDurationMs: 187_000, liveAudioDurationMs: 213_629 }),
    ).toBe(213_629);
  });
});

describe('seekChangeAction', () => {
  it('previews while pointer is down', () => {
    expect(seekChangeAction(true)).toBe('preview');
  });

  it('commits immediately for keyboard changes', () => {
    expect(seekChangeAction(false)).toBe('commit');
  });
});
