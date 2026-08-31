import { describe, expect, it } from 'vitest';
import {
  combineDurationTotals,
  queueCurrentLeftoverMs,
  queueRemainingDurations,
  queueUpcomingDurations,
  sumListedDurations,
  sumQueueItemDurations,
} from './listDuration';

describe('sumListedDurations', () => {
  it('sums known durations and counts unknowns', () => {
    expect(sumListedDurations([180_000, 240_000, null])).toEqual({
      totalMs: 420_000,
      unknownCount: 1,
    });
  });

  it('returns zero total when every duration is unknown', () => {
    expect(sumListedDurations([null, null])).toEqual({
      totalMs: 0,
      unknownCount: 2,
    });
  });
});

describe('sumQueueItemDurations', () => {
  it('prefers duration overrides by track id', () => {
    const overrides = new Map<number, number>([[2, 300_000]]);
    expect(
      sumQueueItemDurations(
        [
          { track: { id: 1, durationMs: 180_000 } },
          { track: { id: 2, durationMs: null } },
        ],
        overrides,
      ),
    ).toEqual({ totalMs: 480_000, unknownCount: 0 });
  });
});

describe('queueUpcomingDurations', () => {
  const items = [
    { id: 10, track: { id: 1, durationMs: 60_000 } },
    { id: 11, track: { id: 2, durationMs: 120_000 } },
    { id: 12, track: { id: 3, durationMs: null } },
  ];

  it('sums only items after the current queue item', () => {
    expect(queueUpcomingDurations(items, 10)).toEqual({
      totalMs: 120_000,
      unknownCount: 1,
    });
  });

  it('returns zero when nothing is playing', () => {
    expect(queueUpcomingDurations(items, null)).toEqual({
      totalMs: 0,
      unknownCount: 0,
    });
  });
});

describe('queueCurrentLeftoverMs', () => {
  it('subtracts position from duration', () => {
    expect(queueCurrentLeftoverMs(180_000, 30_000)).toBe(150_000);
  });

  it('never returns negative values', () => {
    expect(queueCurrentLeftoverMs(180_000, 200_000)).toBe(0);
  });
});

describe('queueRemainingDurations', () => {
  const items = [
    { id: 10, track: { id: 1, durationMs: 180_000 } },
    { id: 11, track: { id: 2, durationMs: 120_000 } },
    { id: 12, track: { id: 3, durationMs: 60_000 } },
  ];

  it('includes current leftover and upcoming tracks', () => {
    expect(
      queueRemainingDurations({
        items,
        currentQueueItemId: 10,
        positionMs: 30_000,
        currentDurationMs: 180_000,
      }),
    ).toEqual({ totalMs: 330_000, unknownCount: 0 });
  });

  it('counts unknown current and upcoming durations', () => {
    const mixed = [
      { id: 10, track: { id: 1, durationMs: null } },
      { id: 11, track: { id: 2, durationMs: 120_000 } },
    ];
    expect(
      queueRemainingDurations({
        items: mixed,
        currentQueueItemId: 10,
        positionMs: 0,
        currentDurationMs: 0,
      }),
    ).toEqual({ totalMs: 120_000, unknownCount: 1 });
  });
});

describe('combineDurationTotals', () => {
  it('adds totals and unknown counts', () => {
    expect(
      combineDurationTotals(
        { totalMs: 100, unknownCount: 1 },
        { totalMs: 200, unknownCount: 2 },
      ),
    ).toEqual({ totalMs: 300, unknownCount: 3 });
  });
});
