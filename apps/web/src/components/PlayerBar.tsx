import { useEffect, useState } from 'react';
import { FiPause, FiPlay, FiSkipForward } from 'react-icons/fi';
import { TrackDto } from '@karaokej/shared';
import { api } from '../api';
import { formatDuration, lyricBadge } from '../format';
import { useSession, trackLabel } from '../session/SessionProvider';
import { LyricSearchModal } from './LyricSearchModal';
import { ProcessingText } from './ProcessingText';
import { StarRating } from './StarRating';

export function PlayerBar({ compact = false }: { compact?: boolean }) {
  const { state, positionMs, isPlayer } = useSession();
  const [scrub, setScrub] = useState<number | null>(null);
  const [fetchingLyrics, setFetchingLyrics] = useState(false);
  const [lyricSearchTrack, setLyricSearchTrack] = useState<TrackDto | null>(null);
  const track = state.playback.currentTrack;

  useEffect(() => {
    setFetchingLyrics(false);
    setLyricSearchTrack(null);
  }, [track?.id]);

  const duration = track?.durationMs ?? 0;
  const playing = state.playback.status === 'playing';
  const displayed = scrub ?? Math.min(positionMs, duration || positionMs);
  const playLabel = playing ? 'Pause' : 'Play';
  const badge = track ? lyricBadge(track.lyricStatus) : null;
  const canFetch = track != null && track.lyricStatus !== 'present';
  const fetchLabel = fetchingLyrics ? 'Fetching…' : 'Fetch lyric';

  return (
    <footer className={`player-bar ${compact ? 'compact' : ''}`}>
      <div className="player-track">
        <strong>{trackLabel(track)}</strong>
        {!compact && (
          <span>
            {formatDuration(displayed)} / {formatDuration(duration)}
          </span>
        )}
        {track && badge && (canFetch ? (
          <button
            type="button"
            className={`badge ${badge.tone} badge-fetch`}
            disabled={fetchingLyrics}
            onClick={async () => {
              setFetchingLyrics(true);
              try {
                const updated = await api.fetchTrackLyrics(track.id);
                if (updated.lyricStatus === 'not_found') {
                  setLyricSearchTrack(updated);
                }
              } catch {
                /* keep the previous badge if the fetch fails */
              } finally {
                setFetchingLyrics(false);
              }
            }}
            title={fetchLabel}
            aria-label={fetchLabel}
          >
            <span className="badge-idle">
              {fetchingLyrics ? (
                <ProcessingText>Fetching…</ProcessingText>
              ) : (
                badge.label
              )}
            </span>
            {!fetchingLyrics && (
              <span className="badge-action">Fetch lyric</span>
            )}
          </button>
        ) : (
          <span className={`badge ${badge.tone}`}>{badge.label}</span>
        ))}
        {track && (
          <StarRating
            value={track.rating}
            compact
            ariaLabel={`Rate ${trackLabel(track)}`}
            onConfirm={async (rating) => {
              try {
                await api.setTrackRating(track.id, rating);
              } catch {
                /* keep the previous stars if the write fails */
              }
            }}
          />
        )}
      </div>
      <div className="player-controls">
        <button
          type="button"
          className="icon-btn"
          onClick={() => void (playing ? api.pause() : api.play())}
          title={playLabel}
          aria-label={playLabel}
        >
          {playing ? <FiPause aria-hidden /> : <FiPlay aria-hidden />}
        </button>
        <button
          type="button"
          className="icon-btn"
          onClick={() => void api.skip()}
          title="Skip"
          aria-label="Skip"
        >
          <FiSkipForward aria-hidden />
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
      <LyricSearchModal
        open={lyricSearchTrack != null}
        track={lyricSearchTrack}
        onClose={() => setLyricSearchTrack(null)}
      />
    </footer>
  );
}
