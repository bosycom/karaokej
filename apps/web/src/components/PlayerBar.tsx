import { useEffect, useRef, useState } from 'react';
import { FiPause, FiPlay, FiSkipForward, FiVolume1, FiVolume2, FiVolumeX } from 'react-icons/fi';
import { LuBlend } from 'react-icons/lu';
import { TrackDto } from '@karaokej/shared';
import { api } from '../api';
import { formatDuration } from '../format';
import { CoverArt } from './CoverArt';
import { CoverArtModal } from './CoverArtModal';
import { LyricStatusBadge } from './LyricStatusBadge';
import {
  seekBarDisplayedMs,
  seekBarDurationLabelMs,
  seekBarMaxMs,
  seekChangeAction,
} from '../player/seekBar';
import { useSession, trackLabel } from '../session/SessionProvider';
import { LyricSearchModal } from './LyricSearchModal';
import { StarRating } from './StarRating';

export function PlayerBar({
  compact = false,
  onShowCover,
}: {
  compact?: boolean;
  onShowCover?: (track: TrackDto) => void;
}) {
  const { state, positionMs, liveAudioDurationMs, isPlayer } = useSession();
  const [scrub, setScrub] = useState<number | null>(null);
  const [fetchingLyrics, setFetchingLyrics] = useState(false);
  const [lyricSearchTrack, setLyricSearchTrack] = useState<TrackDto | null>(null);
  const [localCoverTrack, setLocalCoverTrack] = useState<TrackDto | null>(null);
  const [volumeOpen, setVolumeOpen] = useState(false);
  const pointerDownRef = useRef(false);
  const volumeRef = useRef<HTMLDivElement>(null);
  const volumeInputRef = useRef<HTMLInputElement>(null);
  const track = state.playback.currentTrack;
  const volume = state.playback.volume;

  useEffect(() => {
    setFetchingLyrics(false);
    setLyricSearchTrack(null);
    setScrub(null);
  }, [track?.id]);

  useEffect(() => {
    setScrub(null);
  }, [state.playback.seekSeq]);

  useEffect(() => {
    if (!volumeOpen) {
      return;
    }

    volumeInputRef.current?.focus();

    const onPointerDown = (event: MouseEvent) => {
      if (!volumeRef.current?.contains(event.target as Node)) {
        setVolumeOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setVolumeOpen(false);
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [volumeOpen]);

  const trackDurationMs = track?.durationMs ?? 0;
  const durationLabelMs = seekBarDurationLabelMs({
    trackDurationMs,
    liveAudioDurationMs,
  });
  const seekMax = seekBarMaxMs({
    trackDurationMs,
    liveAudioDurationMs,
    positionMs,
  });
  const displayed = seekBarDisplayedMs({ scrub, positionMs });
  const playing = state.playback.status === 'playing';
  const playLabel = playing ? 'Pause' : 'Play';
  const crossfadeOn = state.settings.crossfadeSeconds > 0;
  const crossfadeLabel = crossfadeOn
    ? `Crossfade on, ${state.settings.crossfadeSeconds} seconds`
    : 'Crossfade off';
  const canFetch = track != null && track.lyricStatus !== 'present';
  const showCover = onShowCover ?? setLocalCoverTrack;
  const VolumeIcon = volume <= 0 ? FiVolumeX : volume < 0.5 ? FiVolume1 : FiVolume2;

  const commitSeek = (value: number) => {
    setScrub(null);
    void api.seek(value);
  };

  return (
    <footer className={`player-bar ${compact ? 'compact' : ''}`}>
      <div className="player-track">
        {track && (
          <CoverArt
            track={track}
            size={compact ? 36 : 48}
            onClick={() => showCover(track)}
          />
        )}
        <strong>{trackLabel(track)}</strong>
        {track && (
          <LyricStatusBadge
            status={track.lyricStatus}
            fetching={fetchingLyrics}
            onFetch={
              canFetch
                ? async () => {
                    if (
                      track.lyricStatus === 'not_found' ||
                      track.lyricStatus === 'unavailable'
                    ) {
                      setLyricSearchTrack(track);
                      return;
                    }
                    setFetchingLyrics(true);
                    try {
                      const updated = await api.fetchTrackLyrics(track.id);
                      if (
                        updated.lyricStatus !== 'present' &&
                        updated.lyricStatus !== 'instrumental'
                      ) {
                        setLyricSearchTrack(updated);
                      }
                    } catch {
                      /* keep the previous badge if the fetch fails */
                    } finally {
                      setFetchingLyrics(false);
                    }
                  }
                : undefined
            }
          />
        )}
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
          aria-pressed={crossfadeOn}
          onClick={() =>
            void api.patchSettings({
              crossfadeSeconds: crossfadeOn ? 0 : state.settings.crossfadePrefSeconds,
            })
          }
          title={crossfadeLabel}
          aria-label={crossfadeLabel}
        >
          <LuBlend aria-hidden />
        </button>
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
          max={seekMax}
          value={Math.min(displayed, seekMax)}
          onPointerDown={() => {
            pointerDownRef.current = true;
          }}
          onPointerUp={(event) => {
            pointerDownRef.current = false;
            commitSeek(Number(event.currentTarget.value));
          }}
          onPointerCancel={() => {
            pointerDownRef.current = false;
            setScrub(null);
          }}
          onChange={(event) => {
            const value = Number(event.target.value);
            if (seekChangeAction(pointerDownRef.current) === 'preview') {
              setScrub(value);
              return;
            }
            commitSeek(value);
          }}
          aria-label="Seek"
        />
        {!compact && (
          <span className="player-time">
            {formatDuration(displayed)} / {formatDuration(durationLabelMs)}
          </span>
        )}
        <div
          className={`volume${volumeOpen ? ' is-open' : ''}`}
          ref={volumeRef}
        >
          <button
            type="button"
            className="icon-btn"
            title="Volume"
            aria-label="Volume"
            aria-expanded={volumeOpen}
            aria-controls="player-volume-slider"
            onClick={() => setVolumeOpen((open) => !open)}
          >
            <VolumeIcon aria-hidden />
          </button>
          {volumeOpen ? (
            <input
              id="player-volume-slider"
              ref={volumeInputRef}
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={(event) => void api.volume(Number(event.target.value))}
              aria-label="Volume level"
            />
          ) : null}
        </div>
      </div>
      {!isPlayer && !compact && (
        <p className="player-hint">This window is following playback. Audio is on another device.</p>
      )}
      <LyricSearchModal
        open={lyricSearchTrack != null}
        track={lyricSearchTrack}
        onClose={() => setLyricSearchTrack(null)}
      />
      {!onShowCover && (
        <CoverArtModal track={localCoverTrack} onClose={() => setLocalCoverTrack(null)} />
      )}
    </footer>
  );
}
