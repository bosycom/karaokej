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
  SessionStateDto,
  TrackDto,
  WsServerMessage,
} from '@karaokej/shared';
import { api, emptySession, wsUrl } from '../api';
import { planSourceSwap, resolveAudioSrc } from '../audio/resolveAudioSrc';
import { getKaraokeEngine } from '../audio/karaokeEngine';

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
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const karaokeEngineRef = useRef(getKaraokeEngine());
  const lastSeekSeq = useRef(-1);
  const lastTrackId = useRef<number | null>(null);
  const lastAppliedSrc = useRef<string | null>(null);
  const applyingRemote = useRef(false);
  const checkpointTimer = useRef<number | null>(null);

  const isPlayer = state.playback.playerClientId === clientId;
  const currentTrack = state.playback.currentTrack;

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
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    if (!isPlayer || !currentTrack) {
      audio.pause();
      if (!isPlayer) {
        audio.removeAttribute('src');
        audio.load();
      }
      setPositionMs(state.playback.positionMs);
      return;
    }

    const nextSrc = resolveAudioSrc(currentTrack, state.karaoke);
    const trackChanged = lastTrackId.current !== currentTrack.id;
    const swapPlan = planSourceSwap({
      currentSrc: lastAppliedSrc.current ?? '',
      nextSrc,
      currentTime: audio.currentTime,
      paused: audio.paused,
    });

    if (trackChanged || swapPlan.shouldSwap) {
      lastTrackId.current = currentTrack.id;
      lastAppliedSrc.current = nextSrc;
      applyingRemote.current = true;
      if (trackChanged) {
        setLiveAudioDurationMs(0);
      }
      audio.src = nextSrc;
      audio.load();

      if (!trackChanged && swapPlan.restoreTo != null) {
        const restoreTo = swapPlan.restoreTo;
        const resume = swapPlan.resumePlayback;
        const restore = () => {
          try {
            audio.currentTime = restoreTo;
          } catch {
            /* not ready */
          }
          applyingRemote.current = false;
          if (resume && state.playback.status === 'playing') {
            void audio.play().catch(() => undefined);
          }
        };
        if (audio.readyState >= 1) {
          restore();
        } else {
          audio.addEventListener('loadedmetadata', restore, { once: true });
        }
      }
    }

    if (trackChanged || lastSeekSeq.current !== state.playback.seekSeq) {
      lastSeekSeq.current = state.playback.seekSeq;
      applyingRemote.current = true;
      setPositionMs(state.playback.positionMs);
      const target = state.playback.positionMs / 1000;
      const seek = () => {
        try {
          audio.currentTime = target;
        } catch {
          /* not ready */
        }
        applyingRemote.current = false;
        setPositionMs(audio.currentTime * 1000);
      };
      if (audio.readyState >= 1) {
        seek();
      } else {
        audio.addEventListener('loadedmetadata', seek, { once: true });
      }
    }

    audio.volume = state.playback.volume;
    if (state.playback.status === 'playing') {
      try {
        await audio.play();
      } catch {
        /* autoplay may be blocked until a click */
      }
    } else {
      audio.pause();
    }
  }, [isPlayer, currentTrack, state.karaoke, state.playback]);

  useEffect(() => {
    void applyPlayback();
  }, [applyPlayback]);

  useEffect(() => {
    const audio = audioRef.current;
    const engine = karaokeEngineRef.current;
    if (audio) {
      engine.bind(audio);
    }
    if (isPlayer) {
      engine.applyState(state.karaoke, currentTrack);
    }
  }, [isPlayer, state.karaoke, currentTrack]);

  useEffect(() => {
    return () => {
      karaokeEngineRef.current.dispose();
    };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    const syncPosition = () => {
      if (!isPlayer) {
        return;
      }
      setPositionMs(audio.currentTime * 1000);
    };
    const syncDuration = () => {
      if (!isPlayer || !Number.isFinite(audio.duration) || audio.duration <= 0) {
        setLiveAudioDurationMs(0);
        return;
      }
      setLiveAudioDurationMs(Math.round(audio.duration * 1000));
    };
    const onEnded = () => {
      if (isPlayer) {
        void api.ended(clientId);
      }
    };

    audio.addEventListener('timeupdate', syncPosition);
    audio.addEventListener('seeked', syncPosition);
    audio.addEventListener('loadedmetadata', syncDuration);
    audio.addEventListener('durationchange', syncDuration);
    audio.addEventListener('ended', onEnded);
    syncDuration();
    return () => {
      audio.removeEventListener('timeupdate', syncPosition);
      audio.removeEventListener('seeked', syncPosition);
      audio.removeEventListener('loadedmetadata', syncDuration);
      audio.removeEventListener('durationchange', syncDuration);
      audio.removeEventListener('ended', onEnded);
    };
  }, [isPlayer, clientId]);

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
      const audio = audioRef.current;
      if (!audio || audio.paused || applyingRemote.current) {
        return;
      }
      void api.checkpoint(Math.round(audio.currentTime * 1000), clientId);
    }, 1000);
    return () => {
      if (checkpointTimer.current) {
        window.clearInterval(checkpointTimer.current);
      }
    };
  }, [isPlayer, clientId, state.playback.status, state.playback.positionMs, state.playback.seekSeq]);

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
      <audio ref={audioRef} preload="metadata" />
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
