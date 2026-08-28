import type { KaraokeStateDto, TrackDto } from '@karaokej/shared';

export function resolveAudioSrc(
  track: TrackDto,
  karaoke: KaraokeStateDto,
): string {
  if (
    karaoke.mode === 'ai' &&
    karaoke.stem?.status === 'ready' &&
    karaoke.stem.url
  ) {
    return karaoke.stem.url;
  }
  return `/api/tracks/${track.id}/audio`;
}

export interface SourceSwapPlan {
  shouldSwap: boolean;
  restoreTo: number | null;
  resumePlayback: boolean;
}

export function planSourceSwap(input: {
  currentSrc: string;
  nextSrc: string;
  currentTime: number;
  paused: boolean;
}): SourceSwapPlan {
  if (input.currentSrc === input.nextSrc) {
    return {
      shouldSwap: false,
      restoreTo: null,
      resumePlayback: false,
    };
  }
  if (!input.currentSrc) {
    return {
      shouldSwap: true,
      restoreTo: null,
      resumePlayback: !input.paused,
    };
  }
  return {
    shouldSwap: true,
    restoreTo: input.currentTime,
    resumePlayback: !input.paused,
  };
}
