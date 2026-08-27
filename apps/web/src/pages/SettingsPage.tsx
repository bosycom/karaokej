import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PlayerBar } from '../components/PlayerBar';
import {
  getDismissedIds,
  KNOWN_MODALS,
  resetDismissedModals,
} from '../modals/dismissedModals';
import { useSession } from '../session/SessionProvider';

export function SettingsPage() {
  const { connected, isPlayer } = useSession();
  const [dismissedIds, setDismissedIds] = useState(() => getDismissedIds());
  const [resetMessage, setResetMessage] = useState<string | null>(null);

  const handleReset = () => {
    resetDismissedModals();
    setDismissedIds([]);
    setResetMessage('Dismissed dialogs reset.');
  };

  return (
    <div className="app-shell settings-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Local karaoke appliance</p>
          <h1>Settings</h1>
        </div>
        <div className="topbar-actions">
          <span className={`pill ${connected ? 'ok' : 'warn'}`}>
            {connected ? 'Live' : 'Reconnecting'}
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
