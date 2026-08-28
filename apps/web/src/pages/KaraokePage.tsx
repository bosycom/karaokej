import { Link } from 'react-router-dom';
import { api } from '../api';
import { useSession } from '../session/SessionProvider';
import { KaraokeBackground } from '../backgrounds/KaraokeBackground';
import { LyricStage } from '../components/LyricStage';
import { KaraokePanel } from '../components/KaraokePanel';
import { PlayerBar } from '../components/PlayerBar';

export function KaraokePage() {
  const { state, lyrics, positionMs, isPlayer, clientId } = useSession();
  const track = state.playback.currentTrack;

  return (
    <div className="karaoke-shell">
      <KaraokeBackground
        trackId={track?.id != null ? String(track.id) : null}
        isPlayer={isPlayer}
      />
      <header className="karaoke-header">
        <Link to="/" className="back">
          Controller
        </Link>
        <div className="now-playing">
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
      />
      <KaraokePanel />
      <PlayerBar compact />
    </div>
  );
}
