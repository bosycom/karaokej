import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { TrackDto } from '@karaokej/shared';
import { api } from '../api';
import { useSession } from '../session/SessionProvider';
import { KaraokeBackground } from '../backgrounds/KaraokeBackground';
import { CoverArt } from '../components/CoverArt';
import { LyricStage } from '../components/LyricStage';
import { KaraokePanel } from '../components/KaraokePanel';
import { PlayerBar } from '../components/PlayerBar';
import { MissingLyricsModal } from '../components/MissingLyricsModal';
import { LyricSearchModal } from '../components/LyricSearchModal';

export function KaraokePage() {
  const { state, lyrics, positionMs, isPlayer, clientId } = useSession();
  const track = state.playback.currentTrack;
  const [searchingLyrics, setSearchingLyrics] = useState(false);
  const [missingLyricsTrack, setMissingLyricsTrack] = useState<TrackDto | null>(null);
  const [lyricSearchTrack, setLyricSearchTrack] = useState<TrackDto | null>(null);
  const dismissedTrackIdRef = useRef<number | null>(null);

  const handleContinueWithoutLyrics = useCallback(() => {
    if (track) {
      dismissedTrackIdRef.current = track.id;
    }
    setMissingLyricsTrack(null);
  }, [track?.id]);

  const handleSearchLyrics = useCallback(() => {
    if (missingLyricsTrack) {
      dismissedTrackIdRef.current = missingLyricsTrack.id;
      setLyricSearchTrack(missingLyricsTrack);
    }
    setMissingLyricsTrack(null);
  }, [missingLyricsTrack]);

  const handleMarkUnavailable = useCallback(() => {
    const target = missingLyricsTrack ?? track;
    if (!target) {
      return;
    }
    dismissedTrackIdRef.current = target.id;
    setMissingLyricsTrack(null);
    void api.markLyricsUnavailable(target.id);
  }, [missingLyricsTrack, track?.id]);

  useEffect(() => {
    dismissedTrackIdRef.current = null;
    setMissingLyricsTrack(null);
    setLyricSearchTrack(null);
  }, [track?.id]);

  useEffect(() => {
    const trackId = track?.id;
    if (!trackId) {
      setSearchingLyrics(false);
      return;
    }

    if (track.lyricStatus === 'present' || track.lyricStatus === 'instrumental') {
      setSearchingLyrics(false);
      return;
    }

    if (lyrics?.available && lyrics.lines.length > 0) {
      setSearchingLyrics(false);
      return;
    }

    if (track.lyricStatus === 'unavailable') {
      setSearchingLyrics(false);
      return;
    }

    if (track.lyricStatus === 'not_found' || track.lyricStatus === 'error') {
      setSearchingLyrics(false);
      if (dismissedTrackIdRef.current !== trackId) {
        setMissingLyricsTrack(track);
      }
      return;
    }

    if (track.lyricStatus !== 'missing') {
      setSearchingLyrics(false);
      return;
    }

    if (dismissedTrackIdRef.current === trackId) {
      return;
    }

    let cancelled = false;
    setSearchingLyrics(true);

    void (async () => {
      try {
        const updated = await api.fetchTrackLyrics(trackId);
        if (cancelled) {
          return;
        }
        if (state.playback.currentTrack?.id !== trackId) {
          return;
        }
        if (
          updated.lyricStatus === 'present' ||
          updated.lyricStatus === 'instrumental'
        ) {
          return;
        }
        setMissingLyricsTrack(updated);
      } catch {
        if (!cancelled && state.playback.currentTrack?.id === trackId) {
          setMissingLyricsTrack(track);
        }
      } finally {
        if (!cancelled) {
          setSearchingLyrics(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [track?.id, track?.lyricStatus, lyrics?.available, lyrics?.lines.length, state.playback.currentTrack?.id]);

  return (
    <div className="karaoke-shell">
      <KaraokeBackground
        trackId={track?.id != null ? String(track.id) : null}
        isPlayer={isPlayer}
      />
      <header className="karaoke-header">
        <Link to="/" className="back">
          Back to library
        </Link>
        <div className="now-playing">
          {track && (
            <CoverArt track={track} size={72} className="karaoke-cover" />
          )}
          <p className="eyebrow">{track?.artist ?? 'Karaokej'}</p>
          <h1>{track?.title ?? 'Nothing playing'}</h1>
        </div>
        {!isPlayer && (
          <button type="button" className="claim" onClick={() => void api.claim(clientId)}>
            Play audio here
          </button>
        )}
      </header>
      <LyricStage
        key={track?.id ?? 'idle'}
        lyrics={lyrics}
        positionMs={positionMs}
        hasTrack={Boolean(track)}
        searchingLyrics={searchingLyrics}
      />
      <KaraokePanel />
      <PlayerBar compact />
      <MissingLyricsModal
        open={missingLyricsTrack != null}
        track={missingLyricsTrack}
        onSearchLyrics={handleSearchLyrics}
        onContinue={handleContinueWithoutLyrics}
        onMarkUnavailable={handleMarkUnavailable}
      />
      <LyricSearchModal
        open={lyricSearchTrack != null}
        track={lyricSearchTrack}
        onClose={() => setLyricSearchTrack(null)}
      />
    </div>
  );
}
