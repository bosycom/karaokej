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
  const applyGenerationRef = useRef(0);
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

      const playIncoming = () => {
        try {
          incoming.currentTime = 0;
        } catch {
          /* not ready */
        }
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
        durationMs,
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
    const generation = ++applyGenerationRef.current;
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

      const promotedDurationMs =
        Number.isFinite(newPrimary.duration) && newPrimary.duration > 0
          ? Math.round(newPrimary.duration * 1000)
          : 0;
      liveAudioDurationMsRef.current = promotedDurationMs;
      newPrimary.volume = state.playback.volume;
      setLiveAudioDurationMs(promotedDurationMs);
      setPositionMs(newPrimary.currentTime * 1000);

      if (generation !== applyGenerationRef.current) {
        return;
      }
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

    const sourceChanging = trackChanged || swapPlan.shouldSwap;
    if (sourceChanging) {
      lastTrackId.current = currentTrack.id;
      lastAppliedSrc.current = nextSrc;
      applyingRemote.current = true;
      if (trackChanged) {
        liveAudioDurationMsRef.current = 0;
        setLiveAudioDurationMs(0);
      }
      primary.src = nextSrc;
      primary.load();
    }

    if (trackChanged || seekChanged) {
      lastSeekSeq.current = state.playback.seekSeq;
      applyingRemote.current = true;
      setPositionMs(state.playback.positionMs);
    }

    const needsSeek = trackChanged || seekChanged;
    const restoreTo =
      !trackChanged && swapPlan.shouldSwap ? swapPlan.restoreTo : null;
    const seekTargetSec = needsSeek ? state.playback.positionMs / 1000 : restoreTo;

    if (primary.readyState < 1 && (sourceChanging || needsSeek)) {
      await new Promise<void>((resolve) => {
        const finish = () => {
          primary.removeEventListener('loadedmetadata', finish);
          primary.removeEventListener('error', finish);
          resolve();
        };
        primary.addEventListener('loadedmetadata', finish);
        primary.addEventListener('error', finish);
      });
      if (generation !== applyGenerationRef.current) {
        return;
      }
    }

    if (seekTargetSec != null) {
      try {
        primary.currentTime = seekTargetSec;
      } catch {
        /* not ready */
      }
      applyingRemote.current = false;
      setPositionMs(primary.currentTime * 1000);
      maybeUpdateCrossfade();
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

    if (generation !== applyGenerationRef.current) {
      return;
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
    const elements = [audioARef.current, audioBRef.current].filter(
      (element): element is HTMLAudioElement => element != null,
    );
    if (elements.length === 0) {
      return;
    }

    const isPrimaryEvent = (event: Event) => event.target === getPrimary();

    const applyPrimaryDuration = (primary: HTMLAudioElement | null) => {
      if (!primary || !isPlayer || !Number.isFinite(primary.duration) || primary.duration <= 0) {
        liveAudioDurationMsRef.current = 0;
        setLiveAudioDurationMs(0);
        return;
      }
      const durationMs = Math.round(primary.duration * 1000);
      liveAudioDurationMsRef.current = durationMs;
      setLiveAudioDurationMs(durationMs);
    };

    const syncPosition = (event: Event) => {
      if (!isPlayer || !isPrimaryEvent(event)) {
        return;
      }
      const primary = getPrimary();
      if (!primary) {
        return;
      }
      setPositionMs(primary.currentTime * 1000);
      maybeUpdateCrossfade();
    };
    const syncDuration = (event: Event) => {
      if (!isPrimaryEvent(event)) {
        return;
      }
      applyPrimaryDuration(getPrimary());
    };
    const onEnded = (event: Event) => {
      if (!isPlayer || !isPrimaryEvent(event)) {
        return;
      }
      if (crossfadeRef.current?.active) {
        pendingPromoteRef.current = true;
      }
      void api.ended(clientId);
    };

    for (const element of elements) {
      element.addEventListener('timeupdate', syncPosition);
      element.addEventListener('seeked', syncPosition);
      element.addEventListener('loadedmetadata', syncDuration);
      element.addEventListener('durationchange', syncDuration);
      element.addEventListener('ended', onEnded);
    }
    applyPrimaryDuration(getPrimary());
    return () => {
      for (const element of elements) {
        element.removeEventListener('timeupdate', syncPosition);
        element.removeEventListener('seeked', syncPosition);
        element.removeEventListener('loadedmetadata', syncDuration);
        element.removeEventListener('durationchange', syncDuration);
        element.removeEventListener('ended', onEnded);
      }
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
