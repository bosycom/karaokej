import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PlayerBar } from '../components/PlayerBar';
import { ProcessingText } from '../components/ProcessingText';
import {
  getDismissedIds,
  KNOWN_MODALS,
  resetDismissedModals,
} from '../modals/dismissedModals';
import { api } from '../api';
import { useSession } from '../session/SessionProvider';

export function SettingsPage() {
  const { connected, isPlayer, state } = useSession();
  const [dismissedIds, setDismissedIds] = useState(() => getDismissedIds());
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);

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

  return (
    <div className="app-shell settings-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Perhaps I can&apos;t sing well, but it is...</p>
          <h1>Settings</h1>
        </div>
        <div className="topbar-actions">
          <span className={`pill ${connected ? 'ok' : 'warn'}`}>
            {connected ? 'Live' : <ProcessingText>Reconnecting</ProcessingText>}
          </span>
          <span className={`pill ${isPlayer ? 'ok' : 'muted'}`}>
            {isPlayer ? 'This device plays audio' : 'Follow only'}
          </span>
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
