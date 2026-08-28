import { useState } from 'react';
import { KaraokeModeControl } from './KaraokeModeControl';
import { ProcessingText } from './ProcessingText';
import { useKaraoke } from '../session/useKaraoke';
import { useLibraryStatus } from '../session/useLibraryStatus';
import { api } from '../api';
import { useSession } from '../session/SessionProvider';

export function KaraokePanel() {
  const { state } = useSession();
  const libraryStatus = useLibraryStatus();
  const {
    karaoke,
    track,
    engineStatus,
    setMode,
    setCenterAmount,
    setBassRetainHz,
    setTrebleRetainHz,
    setMakeupGainDb,
    setEqBand,
    saveForTrack,
    resetForTrack,
  } = useKaraoke();
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const disabled = !track;
  const centerPercent = Math.round(karaoke.live.centerAmount * 100);
  const stem = karaoke.stem;
  const separationJob = state.jobs.separation;
  const demucsAvailable = libraryStatus?.demucsAvailable ?? false;
  const stemActive = karaoke.mode === 'ai' && stem?.status === 'ready';

  const statusMessage =
    engineStatus?.status === 'unsupported'
      ? 'Karaoke unavailable in this browser.'
      : engineStatus?.status === 'blocked'
        ? 'Tap or press a key on the playing device to enable karaoke audio.'
        : engineStatus?.aiFallback
          ? 'AI mode is not available yet — using vocal reduction.'
          : null;

  const stemStatusLabel = (() => {
    if (!track || karaoke.mode !== 'ai') {
      return null;
    }
    switch (stem?.status) {
      case 'ready':
        return 'Instrumental ready — playing separated audio.';
      case 'pending':
      case 'processing':
        return 'Preparing instrumental…';
      case 'failed':
        return stem.error ?? 'Instrumental separation failed.';
      case 'unsupported':
        return 'AI separation is not available on this server.';
      default:
        return 'No instrumental prepared yet.';
    }
  })();

  return (
    <section className="karaoke-panel" aria-label="Karaoke settings">
      <h2 className="karaoke-panel-title">Karaoke</h2>
      {statusMessage && <p className="karaoke-panel-status">{statusMessage}</p>}

      <KaraokeModeControl
        mode={karaoke.mode}
        disabled={disabled}
        demucsAvailable={demucsAvailable}
        onChange={setMode}
      />

      {karaoke.mode === 'ai' && track && (
        <div className="karaoke-panel-section">
          <h3 className="karaoke-panel-subtitle">AI instrumental</h3>
          {stemStatusLabel && (
            <p className="karaoke-panel-status">{stemStatusLabel}</p>
          )}
          {separationJob.running && separationJob.message && (
            <p className="karaoke-panel-status">
              <ProcessingText>{separationJob.message}</ProcessingText>
            </p>
          )}
          {stem?.status === 'failed' && stem.error && (
            <p className="karaoke-panel-feedback error">{stem.error}</p>
          )}
          {demucsAvailable &&
            stem?.status !== 'ready' &&
            stem?.status !== 'processing' && (
              <button
                type="button"
                disabled={disabled || preparing}
                onClick={async () => {
                  setPreparing(true);
                  setError(null);
                  try {
                    await api.separateTrack(track.id);
                    setFeedback('Instrumental separation queued.');
                  } catch (err) {
                    setError(err instanceof Error ? err.message : String(err));
                  } finally {
                    setPreparing(false);
                  }
                }}
              >
                {preparing ? 'Queueing…' : 'Prepare instrumental'}
              </button>
            )}
        </div>
      )}

      {karaoke.mode !== 'off' && (
        <div className="karaoke-panel-section">
          <h3 className="karaoke-panel-subtitle">Vocal Reduction</h3>
          <label className="karaoke-slider-label">
            Centre cancellation
            <input
              className="karaoke-slider"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={stemActive ? 0 : karaoke.live.centerAmount}
              disabled={disabled || stemActive}
              aria-valuetext={`${stemActive ? 0 : centerPercent} percent`}
              onChange={(event) => setCenterAmount(Number(event.target.value))}
            />
            <span className="karaoke-slider-value">
              {stemActive ? '0%' : `${centerPercent}%`}
            </span>
          </label>
          {stemActive && (
            <p className="karaoke-panel-hint">
              Centre cancellation is off while the instrumental stem is playing.
            </p>
          )}
        </div>
      )}

      {karaoke.mode !== 'off' && (
        <details className="karaoke-advanced">
          <summary>Advanced / EQ</summary>
          <div className="karaoke-advanced-body">
            <label className="karaoke-slider-label">
              Bass retain (Hz)
              <input
                className="karaoke-slider"
                type="range"
                min={20}
                max={500}
                step={1}
                value={karaoke.live.bassRetainHz}
                disabled={disabled}
                onChange={(event) =>
                  setBassRetainHz(Number(event.target.value))
                }
              />
              <span className="karaoke-slider-value">
                {Math.round(karaoke.live.bassRetainHz)} Hz
              </span>
            </label>
            <label className="karaoke-slider-label">
              Treble retain (Hz)
              <input
                className="karaoke-slider"
                type="range"
                min={2000}
                max={16000}
                step={10}
                value={karaoke.live.trebleRetainHz}
                disabled={disabled}
                onChange={(event) =>
                  setTrebleRetainHz(Number(event.target.value))
                }
              />
              <span className="karaoke-slider-value">
                {Math.round(karaoke.live.trebleRetainHz)} Hz
              </span>
            </label>
            <label className="karaoke-slider-label">
              Makeup gain (dB)
              <input
                className="karaoke-slider"
                type="range"
                min={-12}
                max={12}
                step={0.5}
                value={karaoke.live.makeupGainDb}
                disabled={disabled}
                onChange={(event) =>
                  setMakeupGainDb(Number(event.target.value))
                }
              />
              <span className="karaoke-slider-value">
                {karaoke.live.makeupGainDb.toFixed(1)} dB
              </span>
            </label>

            {karaoke.live.eqBands.map((band, index) => (
              <div key={`eq-${index}`} className="karaoke-eq-band">
                <p className="karaoke-eq-band-title">EQ band {index + 1}</p>
                <label className="karaoke-slider-label">
                  Frequency
                  <input
                    className="karaoke-slider"
                    type="range"
                    min={20}
                    max={16000}
                    step={10}
                    value={band.frequency}
                    disabled={disabled}
                    onChange={(event) =>
                      setEqBand(index, { frequency: Number(event.target.value) })
                    }
                  />
                  <span className="karaoke-slider-value">
                    {Math.round(band.frequency)} Hz
                  </span>
                </label>
                <label className="karaoke-slider-label">
                  Gain
                  <input
                    className="karaoke-slider"
                    type="range"
                    min={-24}
                    max={24}
                    step={0.5}
                    value={band.gain}
                    disabled={disabled}
                    onChange={(event) =>
                      setEqBand(index, { gain: Number(event.target.value) })
                    }
                  />
                  <span className="karaoke-slider-value">
                    {band.gain.toFixed(1)} dB
                  </span>
                </label>
                <label className="karaoke-slider-label">
                  Q
                  <input
                    className="karaoke-slider"
                    type="range"
                    min={0.1}
                    max={18}
                    step={0.1}
                    value={band.q}
                    disabled={disabled}
                    onChange={(event) =>
                      setEqBand(index, { q: Number(event.target.value) })
                    }
                  />
                  <span className="karaoke-slider-value">{band.q.toFixed(1)}</span>
                </label>
              </div>
            ))}
          </div>
        </details>
      )}

      <div className="karaoke-panel-actions">
        <button
          type="button"
          disabled={disabled || saving || karaoke.isDefault}
          onClick={async () => {
            setSaving(true);
            setError(null);
            setFeedback(null);
            try {
              await saveForTrack();
              setFeedback('Saved for this song.');
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err));
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? 'Saving…' : 'Save for this song'}
        </button>
        <button
          type="button"
          className="secondary"
          disabled={disabled || resetting}
          onClick={async () => {
            setResetting(true);
            setError(null);
            setFeedback(null);
            try {
              await resetForTrack();
              setFeedback('Reset to defaults for this song.');
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err));
            } finally {
              setResetting(false);
            }
          }}
        >
          {resetting ? 'Resetting…' : 'Reset song settings'}
        </button>
      </div>
      {feedback && <p className="karaoke-panel-feedback">{feedback}</p>}
      {error && <p className="karaoke-panel-feedback error">{error}</p>}
      {!track && (
        <p className="karaoke-panel-empty">Queue a song to tune karaoke settings.</p>
      )}
    </section>
  );
}
