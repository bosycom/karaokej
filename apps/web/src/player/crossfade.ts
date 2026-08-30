import type { QueueItemDto, TrackDto } from '@karaokej/shared';
import { audioUrl } from '../audio/resolveAudioSrc';

export interface CrossfadeState {
  active: boolean;
  incomingTrackId: number;
  incomingQueueItemId: number;
  overlapStartRemainingMs: number;
}

export function nextQueueItem(
  queue: QueueItemDto[],
  currentQueueItemId: number | null,
): QueueItemDto | null {
  if (currentQueueItemId == null) {
    return null;
  }
  const current = queue.find((item) => item.id === currentQueueItemId);
  if (!current) {
    return null;
  }
  const next = queue
    .filter((item) => item.position > current.position)
    .sort((a, b) => a.position - b.position || a.id - b.id)[0];
  return next ?? null;
}

export function shouldStartCrossfade(input: {
  enabledSeconds: number;
  remainingMs: number;
  durationMs: number;
  hasNext: boolean;
  alreadyFading: boolean;
  playing: boolean;
}): boolean {
  if (
    input.enabledSeconds <= 0 ||
    input.durationMs <= 0 ||
    !input.playing ||
    !input.hasNext ||
    input.alreadyFading
  ) {
    return false;
  }
  return input.remainingMs <= input.enabledSeconds * 1000;
}

export function crossfadeGains(
  remainingMs: number,
  overlapStartRemainingMs: number,
): { outgoing: number; incoming: number } {
  if (overlapStartRemainingMs <= 0) {
    return { outgoing: 0, incoming: 1 };
  }
  const outgoing = Math.max(0, Math.min(1, remainingMs / overlapStartRemainingMs));
  return { outgoing, incoming: 1 - outgoing };
}

export function incomingTrackSrc(track: TrackDto): string {
  return audioUrl(track);
}

export function shouldPromoteCrossfade(input: {
  crossfade: CrossfadeState | null;
  trackChanged: boolean;
  currentTrackId: number | null;
}): boolean {
  return Boolean(
    input.crossfade?.active &&
      input.trackChanged &&
      input.currentTrackId != null &&
      input.currentTrackId === input.crossfade.incomingTrackId,
  );
}

export function trackRemainingMs(
  durationMs: number,
  positionMs: number,
): number {
  if (durationMs <= 0) {
    return 0;
  }
  return Math.max(0, durationMs - positionMs);
}
