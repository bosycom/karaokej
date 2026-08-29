import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { LibraryStatusDto } from '@karaokej/shared';
import { KaraokeModeControl } from '../components/KaraokeModeControl';
import { UiScaleControl } from '../components/UiScaleControl';
import { PlayerBar } from '../components/PlayerBar';
import { ProcessingText } from '../components/ProcessingText';
import {
  getDismissedIds,
  KNOWN_MODALS,
  resetDismissedModals,
} from '../modals/dismissedModals';
import {
  BACKGROUND_MODE_LABELS,
  BACKGROUND_MODE_OPTIONS,
  BackgroundMode,
  readBackgroundMode,
  writeBackgroundMode,
} from '../backgrounds/backgroundMode';
import { api } from '../api';
import { useKaraoke } from '../session/useKaraoke';
import { useSession } from '../session/SessionProvider';

export function SettingsPage() {
  const { connected, isPlayer, state } = useSession();
  const { karaoke, setMode } = useKaraoke();
  const [dismissedIds, setDismissedIds] = useState(() => getDismissedIds());
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [libraryStatus, setLibraryStatus] = useState<LibraryStatusDto | null>(null);
  const [backgroundMode, setBackgroundMode] = useState<BackgroundMode>(() => readBackgroundMode());

  useEffect(() => {
    void api.libraryStatus().then(setLibraryStatus).catch(() => {
      /* leave null */
    });
  }, []);

  const handleReset = () => {
    resetDismissedModals();
    setDismissedIds([]);
    setResetMessage('Dismissed dialogs reset.');
  };

  const handleRemovePlayedChange = (checked: boolean) => {
    setSettingsError(null);
    void api.patchSettings({ removePlayedFromQueue: checked }).catch((err) => {
      setSettingsError(err instanceof Error ? err.message : String(err));
    });
  };

  const handleCrossfadeChange = (seconds: number) => {
    setSettingsError(null);
    void api.patchSettings({ crossfadeSeconds: seconds }).catch((err) => {
      setSettingsError(err instanceof Error ? err.message : String(err));
    });
  };

  const crossfadeLabel =
    state.settings.crossfadeSeconds === 0
      ? 'Off'
      : `${state.settings.crossfadeSeconds} second${state.settings.crossfadeSeconds === 1 ? '' : 's'}`;

  const handleBackgroundModeChange = (mode: BackgroundMode) => {
    writeBackgroundMode(mode);
    setBackgroundMode(mode);
  };

  return (
    <div className="app-shell settings-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Perhaps I can&apos;t sing well, but it is...</p>
          <h1>Settings</h1>
        </div>
        <div className="topbar-actions">
          <KaraokeModeControl
            mode={karaoke.mode}
            compact
            disabled={!state.playback.currentTrack}
            demucsAvailable={libraryStatus?.demucsAvailable ?? false}
            onChange={setMode}
          />
          <span className={`pill ${connected ? 'ok' : 'warn'}`}>
            {connected ? 'Live' : <ProcessingText>Reconnecting</ProcessingText>}
          </span>
          <span className={`pill ${isPlayer ? 'ok' : 'muted'}`}>
            {isPlayer ? 'This device plays audio' : 'Follow only'}
          </span>
          <UiScaleControl />
          <Link className="topbar-link" to="/">
            Back to library
          </Link>
        </div>
      </header>

      <main className="settings-page">
        <section className="settings-section">
          <h2>Queue</h2>
          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={state.settings.removePlayedFromQueue}
              onChange={(event) => handleRemovePlayedChange(event.target.checked)}
            />
            <span>Remove played songs from the Queue List</span>
          </label>
          <p className="settings-copy">
            When enabled, a song is removed from the queue after it finishes playing
            naturally. Skipped songs stay in the queue. Audio files are not deleted.
          </p>
          {settingsError && <p className="settings-feedback error">{settingsError}</p>}
        </section>

        <section className="settings-section">
          <h2>Playback</h2>
          <label className="karaoke-slider-label">
            Crossfade
            <input
              className="karaoke-slider"
              type="range"
              min={0}
              max={10}
              step={1}
              value={state.settings.crossfadeSeconds}
              onChange={(event) => handleCrossfadeChange(Number(event.target.value))}
              aria-valuetext={crossfadeLabel}
            />
            <span className="karaoke-slider-value">{crossfadeLabel}</span>
          </label>
          <p className="settings-copy">
            When enabled, the next queued song starts fading in before the current
            song ends. Set to 0 to turn off. Use the crossfade button in the
            player bar to toggle quickly; it stays on for every song until you
            turn it off.
          </p>
          {settingsError && <p className="settings-feedback error">{settingsError}</p>}
        </section>

        <section className="settings-section">
          <h2>Karaoke background</h2>
          <fieldset className="settings-fieldset">
            <legend className="sr-only">Karaoke background</legend>
            {BACKGROUND_MODE_OPTIONS.map((option) => (
              <label key={option} className="settings-toggle">
                <input
                  type="radio"
                  name="karaoke-background"
                  value={option}
                  checked={backgroundMode === option}
                  onChange={() => handleBackgroundModeChange(option)}
                />
                <span>{BACKGROUND_MODE_LABELS[option]}</span>
              </label>
            ))}
          </fieldset>
          <p className="settings-copy">
            Applies to the karaoke display on this device. Shuffle picks a random
            animation for each song.
          </p>
        </section>

        <section className="settings-section">
          <h2>Download helper</h2>
          <p className="settings-copy">
            {libraryStatus?.ytdlpAvailable
              ? `yt-dlp found at ${libraryStatus.ytdlpPath}`
              : `yt-dlp not found at ${libraryStatus?.ytdlpPath ?? 'the configured path'}. Set YTDLP_PATH in .env if it is installed.`}
          </p>
          <p className="settings-copy">
            {libraryStatus?.ytsaverAvailable
              ? `YT Saver found at ${libraryStatus.ytsaverPath}`
              : `YT Saver not found at ${libraryStatus?.ytsaverPath ?? 'the configured path'}. Set YTSAVER_PATH in .env if it is installed.`}
          </p>
          <p className="settings-copy">
            {libraryStatus?.demucsAvailable
              ? `Demucs found (${libraryStatus.demucsPath})`
              : `Demucs not found (${libraryStatus?.demucsPath ?? 'demucs'}). Install with pipx install demucs or set DEMUCS_PATH in .env.`}
          </p>
        </section>

        <section className="settings-section">
          <h2>Help dialogs</h2>
          <p className="settings-copy">
            Help dialogs can be hidden with &ldquo;Do not show again&rdquo;. Reset
            them here to show the next time you start a scan or lyrics fetch.
          </p>
          <ul className="settings-list">
            {KNOWN_MODALS.map((modal) => (
              <li key={modal.id}>
                <span>{modal.label}</span>
                <span className={`badge ${dismissedIds.includes(modal.id) ? 'warn' : 'ok'}`}>
                  {dismissedIds.includes(modal.id) ? 'Hidden' : 'Shown'}
                </span>
              </li>
            ))}
          </ul>
          <div className="settings-actions">
            <button type="button" onClick={handleReset}>
              Reset dismissed dialogs
            </button>
            {resetMessage && <p className="settings-feedback">{resetMessage}</p>}
          </div>
        </section>
      </main>

      <PlayerBar />
    </div>
  );
}
