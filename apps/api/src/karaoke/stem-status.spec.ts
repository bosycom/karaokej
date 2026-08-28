import { describe, expect, it } from 'vitest';
import { resolveStemStatusForTrack } from './stem-status';
import type { KaraokeStemRow } from '../db/types';

const stemRow = (patch: Partial<KaraokeStemRow>): KaraokeStemRow => ({
  track_id: 1,
  status: 'ready',
  model: 'htdemucs',
  model_version: 'htdemucs',
  file_path: '/tmp/1.mp3',
  size_bytes: 1000,
  source_mtime_ms: 100,
  source_size_bytes: 200,
  error: null,
  requested_at: null,
  processed_at: null,
  created_at: 0,
  updated_at: 0,
  ...patch,
});

describe('resolveStemStatusForTrack', () => {
  it('returns null when no stem row exists', () => {
    expect(
      resolveStemStatusForTrack({ mtime_ms: 100, size_bytes: 200 }, undefined),
    ).toBeNull();
  });

  it('returns ready for a fresh ready stem', () => {
    expect(
      resolveStemStatusForTrack(
        { mtime_ms: 100, size_bytes: 200 },
        stemRow({ status: 'ready' }),
      ),
    ).toBe('ready');
  });

  it('downgrades stale ready stems to pending', () => {
    expect(
      resolveStemStatusForTrack(
        { mtime_ms: 999, size_bytes: 200 },
        stemRow({ status: 'ready' }),
      ),
    ).toBe('pending');
  });

  it('downgrades stale processing stems to pending', () => {
    expect(
      resolveStemStatusForTrack(
        { mtime_ms: 100, size_bytes: 999 },
        stemRow({ status: 'processing' }),
      ),
    ).toBe('pending');
  });

  it('passes through pending status', () => {
    expect(
      resolveStemStatusForTrack(
        { mtime_ms: 100, size_bytes: 200 },
        stemRow({ status: 'pending' }),
      ),
    ).toBe('pending');
  });
});
