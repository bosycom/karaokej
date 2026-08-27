import { useState } from 'react';
import { api } from '../api';
import { formatDuration } from '../format';
import { useSession, trackLabel } from '../session/SessionProvider';

export function PlayerBar({ compact = false }: { compact?: boolean }) {
  const { state, positionMs, isPlayer } = useSession();
  const [scrub, setScrub] = useState<number | null>(null);
  const track = state.playback.currentTrack;
  const duration = track?.durationMs ?? 0;
  const playing = state.playback.status === 'playing';
  const displayed = scrub ?? Math.min(positionMs, duration || positionMs);

  return (
    <footer className={`player-bar ${compact ? 'compact' : ''}`}>
      <div className="player-track">
        <strong>{trackLabel(track)}</strong>
        {!compact && (
          <span>
            {formatDuration(displayed)} / {formatDuration(duration)}
          </span>
        )}
      </div>
      <div className="player-controls">
        <button type="button" onClick={() => void (playing ? api.pause() : api.play())}>
          {playing ? 'Pause' : 'Play'}
        </button>
        <button type="button" onClick={() => void api.skip()}>
          Skip
        </button>
        <input
          className="seek"
          type="range"
          min={0}
          max={Math.max(duration, 1)}
          value={displayed}
          onChange={(event) => setScrub(Number(event.target.value))}
          onPointerUp={() => {
            if (scrub != null) {
              void api.seek(scrub);
              setScrub(null);
            }
          }}
          aria-label="Seek"
        />
        <label className="volume">
          Vol
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={state.playback.volume}
            onChange={(event) => void api.volume(Number(event.target.value))}
          />
        </label>
      </div>
      {!isPlayer && !compact && (
        <p className="player-hint">This window is following playback. Audio is on another device.</p>
      )}
    </footer>
  );
}
