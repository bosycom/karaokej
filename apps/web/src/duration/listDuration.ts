export interface ListedDurationTotals {
  totalMs: number;
  unknownCount: number;
}

export function sumListedDurations(
  durationMs: Array<number | null | undefined>,
): ListedDurationTotals {
  let totalMs = 0;
  let unknownCount = 0;
  for (const ms of durationMs) {
    if (ms == null || ms <= 0) {
      unknownCount += 1;
    } else {
      totalMs += ms;
    }
  }
  return { totalMs, unknownCount };
}

export function sumQueueItemDurations(
  items: Array<{ track: { id: number; durationMs: number | null } }>,
  durationByTrackId?: ReadonlyMap<number, number>,
): ListedDurationTotals {
  return sumListedDurations(
    items.map(
      (item) => durationByTrackId?.get(item.track.id) ?? item.track.durationMs,
    ),
  );
}

export function queueUpcomingDurations(
  items: Array<{ id: number; track: { id: number; durationMs: number | null } }>,
  currentQueueItemId: number | null,
  durationByTrackId?: ReadonlyMap<number, number>,
): ListedDurationTotals {
  if (currentQueueItemId == null) {
    return { totalMs: 0, unknownCount: 0 };
  }
  const currentIndex = items.findIndex((item) => item.id === currentQueueItemId);
  if (currentIndex < 0) {
    return { totalMs: 0, unknownCount: 0 };
  }
  return sumListedDurations(
    items.slice(currentIndex + 1).map(
      (item) => durationByTrackId?.get(item.track.id) ?? item.track.durationMs,
    ),
  );
}

export function queueCurrentLeftoverMs(
  currentDurationMs: number,
  positionMs: number,
): number {
  if (currentDurationMs <= 0) {
    return 0;
  }
  return Math.max(0, currentDurationMs - positionMs);
}

export function combineDurationTotals(
  ...parts: ListedDurationTotals[]
): ListedDurationTotals {
  let totalMs = 0;
  let unknownCount = 0;
  for (const part of parts) {
    totalMs += part.totalMs;
    unknownCount += part.unknownCount;
  }
  return { totalMs, unknownCount };
}

export function queueRemainingDurations(input: {
  items: Array<{ id: number; track: { id: number; durationMs: number | null } }>;
  currentQueueItemId: number | null;
  positionMs: number;
  currentDurationMs: number;
  durationByTrackId?: ReadonlyMap<number, number>;
}): ListedDurationTotals {
  const {
    items,
    currentQueueItemId,
    positionMs,
    currentDurationMs,
    durationByTrackId,
  } = input;
  if (currentQueueItemId == null) {
    return { totalMs: 0, unknownCount: 0 };
  }
  const currentIndex = items.findIndex((item) => item.id === currentQueueItemId);
  if (currentIndex < 0) {
    return { totalMs: 0, unknownCount: 0 };
  }

  const currentItem = items[currentIndex]!;
  const resolvedCurrentDuration =
    durationByTrackId?.get(currentItem.track.id) ??
    (currentDurationMs > 0 ? currentDurationMs : currentItem.track.durationMs ?? 0);

  const currentPart: ListedDurationTotals =
    resolvedCurrentDuration > 0
      ? {
          totalMs: queueCurrentLeftoverMs(resolvedCurrentDuration, positionMs),
          unknownCount: 0,
        }
      : { totalMs: 0, unknownCount: 1 };

  const upcoming = queueUpcomingDurations(
    items,
    currentQueueItemId,
    durationByTrackId,
  );
  return combineDurationTotals(currentPart, upcoming);
}
