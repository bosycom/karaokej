import { useCallback, useRef } from 'react';
import {
  KaraokeMode,
  KaraokeSettingsDto,
  KaraokeStateDto,
  KaraokeTrackSettings,
} from '@karaokej/shared';
import { api } from '../api';
import { getKaraokeEngine } from '../audio/karaokeEngine';
import { useSession } from './SessionProvider';

const LIVE_PATCH_MS = 120;

export function useKaraoke() {
  const { state, isPlayer } = useSession();
  const karaoke = state.karaoke;
  const track = state.playback.currentTrack;
  const liveTimer = useRef<number | null>(null);
  const pendingLive = useRef<Partial<KaraokeTrackSettings> | null>(null);

  const applyLocal = useCallback(
    (next: KaraokeStateDto) => {
      if (!isPlayer) {
        return;
      }
      const engine = getKaraokeEngine();
      engine.applyState(next, track);
    },
    [isPlayer, track],
  );

  const flushLive = useCallback(() => {
    if (!pendingLive.current || !track) {
      return;
    }
    const patch = pendingLive.current;
    pendingLive.current = null;
    void api.patchKaraokeLive({ ...karaoke.live, ...patch, trackId: track.id });
  }, [karaoke.live, track]);

  const scheduleLivePatch = useCallback(
    (patch: Partial<KaraokeTrackSettings>) => {
      if (!track) {
        return;
      }
      const merged: KaraokeStateDto = {
        ...karaoke,
        live: {
          ...karaoke.live,
          ...patch,
          eqBands: patch.eqBands ?? karaoke.live.eqBands,
        },
        isDefault: false,
        trackId: track.id,
      };
      applyLocal(merged);
      pendingLive.current = { ...pendingLive.current, ...patch };
      if (liveTimer.current) {
        window.clearTimeout(liveTimer.current);
      }
      liveTimer.current = window.setTimeout(flushLive, LIVE_PATCH_MS);
    },
    [applyLocal, flushLive, karaoke, track],
  );

  const setMode = useCallback(
    (mode: KaraokeMode) => {
      const optimistic: KaraokeStateDto = { ...karaoke, mode };
      applyLocal(optimistic);
      void api.setKaraokeMode(mode);
    },
    [applyLocal, karaoke],
  );

  const setCenterAmount = useCallback(
    (centerAmount: number) => scheduleLivePatch({ centerAmount }),
    [scheduleLivePatch],
  );

  const setBassRetainHz = useCallback(
    (bassRetainHz: number) => scheduleLivePatch({ bassRetainHz }),
    [scheduleLivePatch],
  );

  const setTrebleRetainHz = useCallback(
    (trebleRetainHz: number) => scheduleLivePatch({ trebleRetainHz }),
    [scheduleLivePatch],
  );

  const setMakeupGainDb = useCallback(
    (makeupGainDb: number) => scheduleLivePatch({ makeupGainDb }),
    [scheduleLivePatch],
  );

  const setEqBand = useCallback(
    (index: number, band: Partial<KaraokeTrackSettings['eqBands'][number]>) => {
      const eqBands = karaoke.live.eqBands.map((existing, i) =>
        i === index ? { ...existing, ...band } : existing,
      );
      scheduleLivePatch({ eqBands });
    },
    [karaoke.live.eqBands, scheduleLivePatch],
  );

  const saveForTrack = useCallback(async (): Promise<KaraokeSettingsDto | null> => {
    if (!track) {
      return null;
    }
    if (liveTimer.current) {
      window.clearTimeout(liveTimer.current);
      liveTimer.current = null;
    }
    pendingLive.current = null;
    return api.saveKaraokeSettings(track.id, karaoke.live);
  }, [karaoke.live, track]);

  const resetForTrack = useCallback(async (): Promise<KaraokeSettingsDto | null> => {
    if (!track) {
      return null;
    }
    return api.resetKaraokeSettings(track.id);
  }, [track]);

  const engineStatus = isPlayer ? getKaraokeEngine().getSnapshot() : null;

  return {
    karaoke,
    track,
    isPlayer,
    engineStatus,
    setMode,
    setCenterAmount,
    setBassRetainHz,
    setTrebleRetainHz,
    setMakeupGainDb,
    setEqBand,
    saveForTrack,
    resetForTrack,
  };
}
