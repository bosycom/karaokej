import { JobStatusDto, QueueItemDto } from '@karaokej/shared';

export type QueueSeparationDisplay =
  | { kind: 'none' }
  | { kind: 'queued' }
  | { kind: 'progress'; percent: number };

export function queueSeparationDisplay(
  item: QueueItemDto,
  separationJob: JobStatusDto,
): QueueSeparationDisplay {
  const stem = item.stem;
  if (!stem) {
    return { kind: 'none' };
  }
  if (
    stem.status === 'ready' ||
    stem.status === 'none' ||
    stem.status === 'failed' ||
    stem.status === 'unsupported'
  ) {
    return { kind: 'none' };
  }

  if (
    separationJob.running &&
    separationJob.trackId === item.track.id &&
    separationJob.total > 0
  ) {
    const percent = Math.min(
      100,
      Math.max(0, Math.round((separationJob.current / separationJob.total) * 100)),
    );
    return { kind: 'progress', percent };
  }

  if (stem.status === 'processing') {
    return { kind: 'progress', percent: 0 };
  }

  if (stem.status === 'pending') {
    return { kind: 'queued' };
  }

  return { kind: 'none' };
}
