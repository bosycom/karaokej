import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  LyricsDto,
  QueueItemDto,
  SessionStateDto,
  TrackDto,
  WsServerMessage,
} from '@karaokej/shared';
import { api, emptySession, wsUrl } from '../api';
import { planSourceSwap, resolveAudioSrc } from '../audio/resolveAudioSrc';
import { getKaraokeEngine } from '../audio/karaokeEngine';
import {
  crossfadeGains,
  incomingTrackSrc,
  nextQueueItem,
  shouldPromoteCrossfade,
  shouldStartCrossfade,
  trackRemainingMs,
  type CrossfadeState,
} from '../player/crossfade';
import { seekBarDurationLabelMs } from '../player/seekBar';

const CLIENT_KEY = 'karaokej.clientId';

function randomClientId(): string {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  if (typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  return `client-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function getClientId(): string {
  const existing = localStorage.getItem(CLIENT_KEY);
  if (existing) {
    return existing;
  }
  const id = randomClientId();
  localStorage.setItem(CLIENT_KEY, id);
  return id;
}

interface SessionContextValue {
  clientId: string;
  state: SessionStateDto;
  isPlayer: boolean;
  positionMs: number;
  liveAudioDurationMs: number;
  lyrics: LyricsDto | null;
  connected: boolean;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) {
    throw new Error('useSession must be used within SessionProvider');
  }
  return value;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const clientId = useMemo(getClientId, []);
  const [state, setState] = useState<SessionStateDto>(emptySession);
  const [connected, setConnected] = useState(false);
  const [positionMs, setPositionMs] = useState(0);
  const [liveAudioDurationMs, setLiveAudioDurationMs] = useState(0);
  const [lyrics, setLyrics] = useState<LyricsDto | null>(null);
  const audioARef = useRef<HTMLAudioElement | null>(null);
  const audioBRef = useRef<HTMLAudioElement | null>(null);
  const primaryIsARef = useRef(true);
  const karaokeEngineRef = useRef(getKaraokeEngine());
  const lastSeekSeq = useRef(-1);
  const lastTrackId = useRef<number | null>(null);
  const lastAppliedSrc = useRef<string | null>(null);
  const applyingRemote = useRef(false);
  const checkpointTimer = useRef<number | null>(null);
  const crossfadeRef = useRef<CrossfadeState | null>(null);
  const pendingPromoteRef = useRef(false);
  const stateRef = useRef(state);
  const liveAudioDurationMsRef = useRef(liveAudioDurationMs);

  stateRef.current = state;
  liveAudioDurationMsRef.current = liveAudioDurationMs;

  const isPlayer = state.playback.playerClientId === clientId;
  const currentTrack = state.playback.currentTrack;

  const getPrimary = useCallback((): HTMLAudioElement | null => {
    return primaryIsARef.current ? audioARef.current : audioBRef.current;
  }, []);

  const getIncoming = useCallback((): HTMLAudioElement | null => {
    return primaryIsARef.current ? audioBRef.current : audioARef.current;
  }, []);

  const swapPrimaryIncoming = useCallback(() => {
    primaryIsARef.current = !primaryIsARef.current;
  }, []);

  const clearIncomingElement = useCallback((incoming: HTMLAudioElement | null) => {
    if (!incoming) {
      return;
    }
    incoming.pause();
    incoming.removeAttribute('src');
    incoming.load();
  }, []);

  const cancelCrossfade = useCallback(() => {
    const primary = getPrimary();
    const incoming = getIncoming();
    crossfadeRef.current = null;
    pendingPromoteRef.current = false;
    clearIncomingElement(incoming);
    if (primary) {
      primary.volume = stateRef.current.playback.volume;
    }
  }, [clearIncomingElement, getIncoming, getPrimary]);

  const applyCrossfadeVolumes = useCallback(
    (remainingMs: number, overlapStartRemainingMs: number) => {
      const primary = getPrimary();
      const incoming = getIncoming();
      if (!primary || !incoming || !crossfadeRef.current?.active) {
        return;
      }
      const master = stateRef.current.playback.volume;
      const { outgoing, incoming: incomingGain } = crossfadeGains(
        remainingMs,
        overlapStartRemainingMs,
      );
      primary.volume = master * outgoing;
      incoming.volume = master * incomingGain;
    },
    [getIncoming, getPrimary],
  );

  const startCrossfade = useCallback(
    (nextItem: QueueItemDto, remainingMs: number) => {
      const primary = getPrimary();
      const incoming = getIncoming();
      if (!primary || !incoming || crossfadeRef.current?.active) {
        return;
      }

      const src = incomingTrackSrc(nextItem.track);
      incoming.src = src;
      incoming.load();
      incoming.currentTime = 0;

      const playIncoming = () => {
        if (stateRef.current.playback.status === 'playing') {
          void incoming.play().catch(() => undefined);
        }
        applyCrossfadeVolumes(remainingMs, remainingMs);
      };

      crossfadeRef.current = {
        active: true,
        incomingTrackId: nextItem.track.id,
        incomingQueueItemId: nextItem.id,
        overlapStartRemainingMs: remainingMs,
      };

      if (incoming.readyState >= 1) {
        playIncoming();
      } else {
        incoming.addEventListener('loadedmetadata', playIncoming, { once: true });
      }
    },
    [applyCrossfadeVolumes, getIncoming, getPrimary],
  );

  const maybeUpdateCrossfade = useCallback(() => {
    const session = stateRef.current;
    if (!isPlayer || session.playback.status !== 'playing') {
      return;
    }

    const primary = getPrimary();
    if (!primary || primary.paused) {
      return;
    }

    const enabledSeconds = session.settings.crossfadeSeconds;
    const trackDurationMs = session.playback.currentTrack?.durationMs ?? 0;
    const durationMs = seekBarDurationLabelMs({
      trackDurationMs,
      liveAudioDurationMs: liveAudioDurationMsRef.current,
    });
    const positionMs = primary.currentTime * 1000;
    const remainingMs = trackRemainingMs(durationMs, positionMs);
    const crossfade = crossfadeRef.current;

    if (crossfade?.active) {
      const nextStillQueued = session.queue.some(
        (item) => item.id === crossfade.incomingQueueItemId,
      );
      if (!nextStillQueued || enabledSeconds <= 0) {
        cancelCrossfade();
        return;
      }
      applyCrossfadeVolumes(remainingMs, crossfade.overlapStartRemainingMs);
      return;
    }

    const nextItem = nextQueueItem(session.queue, session.playback.currentQueueItemId);
    if (
      shouldStartCrossfade({
        enabledSeconds,
        remainingMs,
        hasNext: nextItem != null,
        alreadyFading: false,
        playing: true,
      }) &&
      nextItem
    ) {
      startCrossfade(nextItem, remainingMs);
    }
  }, [
    applyCrossfadeVolumes,
    cancelCrossfade,
    getPrimary,
    isPlayer,
    startCrossfade,
  ]);

  useEffect(() => {
    let cancelled = false;
    void api.session().then((session) => {
      if (!cancelled) {
        setState(session);
      }
    }).catch(() => {
      /* websocket will fill in */
    });

    let socket: WebSocket | null = null;
    let closed = false;
    let retry: number | null = null;

    const connect = () => {
      socket = new WebSocket(wsUrl());
      socket.addEventListener('open', () => {
        setConnected(true);
        socket?.send(JSON.stringify({ type: 'hello', clientId }));
      });
      socket.addEventListener('message', (event) => {
        try {
          const msg = JSON.parse(String(event.data)) as WsServerMessage;
          if (msg.type === 'session') {
            setState(msg.state);
          }
        } catch {
          /* ignore */
        }
      });
      socket.addEventListener('close', () => {
        setConnected(false);
        if (!closed) {
          retry = window.setTimeout(connect, 1500);
        }
      });
      socket.addEventListener('error', () => {
        socket?.close();
      });
    };

    connect();
    return () => {
      cancelled = true;
      closed = true;
      if (retry) {
        window.clearTimeout(retry);
      }
      socket?.close();
    };
  }, [clientId]);

  useEffect(() => {
    let cancelled = false;
    if (!currentTrack) {
      setLyrics(null);
      return;
    }
    api.lyrics(currentTrack.id).then((data) => {
      if (!cancelled) {
        setLyrics(data);
      }
    }).catch(() => {
      if (!cancelled) {
        setLyrics({ available: false, lines: [] });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [currentTrack?.id, currentTrack?.lyricStatus]);

  const applyPlayback = useCallback(async () => {
    const primary = getPrimary();
    if (!primary) {
      return;
    }

    if (!isPlayer || !currentTrack) {
      cancelCrossfade();
      primary.pause();
      if (!isPlayer) {
        primary.removeAttribute('src');
        primary.load();
        clearIncomingElement(getIncoming());
      }
      setPositionMs(state.playback.positionMs);
      return;
    }

    const trackChanged = lastTrackId.current !== currentTrack.id;
    const seekChanged = lastSeekSeq.current !== state.playback.seekSeq;
    const promote =
      pendingPromoteRef.current &&
      shouldPromoteCrossfade({
        crossfade: crossfadeRef.current,
        trackChanged,
        currentTrackId: currentTrack.id,
      });

    if (promote) {
      pendingPromoteRef.current = false;
      swapPrimaryIncoming();
      const newPrimary = getPrimary();
      const newIncoming = getIncoming();
      if (!newPrimary) {
        return;
      }

      clearIncomingElement(newIncoming);
      crossfadeRef.current = null;
      karaokeEngineRef.current.bind(newPrimary);

      lastTrackId.current = currentTrack.id;
      lastAppliedSrc.current = resolveAudioSrc(currentTrack, state.karaoke);
      lastSeekSeq.current = state.playback.seekSeq;
      applyingRemote.current = false;

      newPrimary.volume = state.playback.volume;
      setLiveAudioDurationMs(
        Number.isFinite(newPrimary.duration) && newPrimary.duration > 0
          ? Math.round(newPrimary.duration * 1000)
          : 0,
      );
      setPositionMs(newPrimary.currentTime * 1000);

      if (state.playback.status === 'playing' && newPrimary.paused) {
        try {
          await newPrimary.play();
        } catch {
          /* autoplay may be blocked until a click */
        }
      } else if (state.playback.status !== 'playing') {
        newPrimary.pause();
      }
      return;
    }

    if (crossfadeRef.current?.active && (seekChanged || trackChanged)) {
      cancelCrossfade();
    }

    const nextSrc = resolveAudioSrc(currentTrack, state.karaoke);
    const swapPlan = planSourceSwap({
      currentSrc: lastAppliedSrc.current ?? '',
      nextSrc,
      currentTime: primary.currentTime,
      paused: primary.paused,
    });

    if (trackChanged || swapPlan.shouldSwap) {
      lastTrackId.current = currentTrack.id;
      lastAppliedSrc.current = nextSrc;
      applyingRemote.current = true;
      if (trackChanged) {
        setLiveAudioDurationMs(0);
      }
      primary.src = nextSrc;
      primary.load();

      if (!trackChanged && swapPlan.restoreTo != null) {
        const restoreTo = swapPlan.restoreTo;
        const resume = swapPlan.resumePlayback;
        const restore = () => {
          try {
            primary.currentTime = restoreTo;
          } catch {
            /* not ready */
          }
          applyingRemote.current = false;
          if (resume && state.playback.status === 'playing') {
            void primary.play().catch(() => undefined);
          }
        };
        if (primary.readyState >= 1) {
          restore();
        } else {
          primary.addEventListener('loadedmetadata', restore, { once: true });
        }
      }
    }

    if (trackChanged || seekChanged) {
      lastSeekSeq.current = state.playback.seekSeq;
      applyingRemote.current = true;
      setPositionMs(state.playback.positionMs);
      const target = state.playback.positionMs / 1000;
      const seek = () => {
        try {
          primary.currentTime = target;
        } catch {
          /* not ready */
        }
        applyingRemote.current = false;
        setPositionMs(primary.currentTime * 1000);
        maybeUpdateCrossfade();
      };
      if (primary.readyState >= 1) {
        seek();
      } else {
        primary.addEventListener('loadedmetadata', seek, { once: true });
      }
    }

    if (!crossfadeRef.current?.active) {
      primary.volume = state.playback.volume;
    } else {
      const trackDurationMs = currentTrack.durationMs ?? 0;
      const durationMs = seekBarDurationLabelMs({
        trackDurationMs,
        liveAudioDurationMs: liveAudioDurationMsRef.current,
      });
      const remainingMs = trackRemainingMs(durationMs, primary.currentTime * 1000);
      applyCrossfadeVolumes(
        remainingMs,
        crossfadeRef.current.overlapStartRemainingMs,
      );
    }

    const incoming = getIncoming();
    if (state.playback.status === 'playing') {
      try {
        await primary.play();
        if (crossfadeRef.current?.active && incoming?.paused) {
          void incoming.play().catch(() => undefined);
        }
      } catch {
        /* autoplay may be blocked until a click */
      }
    } else {
      primary.pause();
      if (crossfadeRef.current?.active) {
        incoming?.pause();
      }
    }
  }, [
    applyCrossfadeVolumes,
    cancelCrossfade,
    clearIncomingElement,
    currentTrack,
    getIncoming,
    getPrimary,
    isPlayer,
    maybeUpdateCrossfade,
    state.karaoke,
    state.playback,
    swapPrimaryIncoming,
  ]);

  useEffect(() => {
    void applyPlayback();
  }, [applyPlayback]);

  useEffect(() => {
    if (state.settings.crossfadeSeconds <= 0) {
      cancelCrossfade();
    }
  }, [cancelCrossfade, state.settings.crossfadeSeconds]);

  useEffect(() => {
    const primary = getPrimary();
    const engine = karaokeEngineRef.current;
    if (primary) {
      engine.bind(primary);
    }
    if (isPlayer) {
      engine.applyState(state.karaoke, currentTrack);
    }
  }, [currentTrack, getPrimary, isPlayer, state.karaoke]);

  useEffect(() => {
    return () => {
      karaokeEngineRef.current.dispose();
    };
  }, []);

  useEffect(() => {
    const primary = getPrimary();
    if (!primary) {
      return;
    }

    const syncPosition = () => {
      if (!isPlayer) {
        return;
      }
      setPositionMs(primary.currentTime * 1000);
      maybeUpdateCrossfade();
    };
    const syncDuration = () => {
      if (!isPlayer || !Number.isFinite(primary.duration) || primary.duration <= 0) {
        setLiveAudioDurationMs(0);
        return;
      }
      setLiveAudioDurationMs(Math.round(primary.duration * 1000));
    };
    const onEnded = () => {
      if (isPlayer) {
        if (crossfadeRef.current?.active) {
          pendingPromoteRef.current = true;
        }
        void api.ended(clientId);
      }
    };

    primary.addEventListener('timeupdate', syncPosition);
    primary.addEventListener('seeked', syncPosition);
    primary.addEventListener('loadedmetadata', syncDuration);
    primary.addEventListener('durationchange', syncDuration);
    primary.addEventListener('ended', onEnded);
    syncDuration();
    return () => {
      primary.removeEventListener('timeupdate', syncPosition);
      primary.removeEventListener('seeked', syncPosition);
      primary.removeEventListener('loadedmetadata', syncDuration);
      primary.removeEventListener('durationchange', syncDuration);
      primary.removeEventListener('ended', onEnded);
    };
  }, [clientId, getPrimary, isPlayer, maybeUpdateCrossfade]);

  useEffect(() => {
    if (!isPlayer) {
      if (state.playback.status === 'playing') {
        const started = Date.now();
        const base = state.playback.positionMs;
        const tick = window.setInterval(() => {
          setPositionMs(base + (Date.now() - started));
        }, 200);
        return () => window.clearInterval(tick);
      }
      setPositionMs(state.playback.positionMs);
      return;
    }

    checkpointTimer.current = window.setInterval(() => {
      const primary = getPrimary();
      if (!primary || primary.paused || applyingRemote.current) {
        return;
      }
      void api.checkpoint(Math.round(primary.currentTime * 1000), clientId);
    }, 1000);
    return () => {
      if (checkpointTimer.current) {
        window.clearInterval(checkpointTimer.current);
      }
    };
  }, [
    clientId,
    getPrimary,
    isPlayer,
    state.playback.positionMs,
    state.playback.seekSeq,
    state.playback.status,
  ]);

  const value = useMemo<SessionContextValue>(
    () => ({
      clientId,
      state,
      isPlayer,
      positionMs,
      liveAudioDurationMs: isPlayer ? liveAudioDurationMs : 0,
      lyrics,
      connected,
    }),
    [clientId, state, isPlayer, positionMs, liveAudioDurationMs, lyrics, connected],
  );

  return (
    <SessionContext.Provider value={value}>
      <audio ref={audioARef} preload="metadata" />
      <audio ref={audioBRef} preload="metadata" hidden />
      {children}
    </SessionContext.Provider>
  );
}

export function trackLabel(track: TrackDto | null): string {
  if (!track) {
    return 'Nothing queued';
  }
  return track.artist ? `${track.artist} — ${track.title}` : track.title;
}
