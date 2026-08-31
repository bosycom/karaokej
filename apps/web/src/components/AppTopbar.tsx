import { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FiSettings } from 'react-icons/fi';
import { api } from '../api';
import { useKaraoke } from '../session/useKaraoke';
import { useLibraryStatus } from '../session/useLibraryStatus';
import { useSession } from '../session/SessionProvider';
import { UiScaleControl } from './UiScaleControl';
import { VocalSettingsMenu } from './VocalSettingsMenu';

interface AppTopbarProps {
  eyebrow: ReactNode;
  title: ReactNode;
  scanOpen?: boolean;
  onScan?: () => void;
  trailing?: ReactNode;
}

export function AppTopbar({
  eyebrow,
  title,
  scanOpen = false,
  onScan,
  trailing,
}: AppTopbarProps) {
  const navigate = useNavigate();
  const { state, isPlayer, clientId } = useSession();
  const { karaoke, setMode } = useKaraoke();
  const status = useLibraryStatus();

  const libraryJobRunning =
    state.jobs.scan.running ||
    state.jobs.lyricsFetch.running ||
    state.jobs.covers.running;

  const handleScan = () => {
    if (onScan) {
      onScan();
      return;
    }
    navigate('/?scan=1');
  };

  return (
    <header className="topbar">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
      </div>
      <div className="topbar-actions">
        <VocalSettingsMenu
          mode={karaoke.mode}
          disabled={!state.playback.currentTrack}
          demucsAvailable={status?.demucsAvailable ?? false}
          onChange={setMode}
        />
        {isPlayer && <span className="pill ok">This device plays audio</span>}
        {!isPlayer && (
          <button type="button" onClick={() => void api.claim(clientId)}>
            Play audio here
          </button>
        )}
        <button
          type="button"
          className={libraryJobRunning ? 'scan-btn-busy' : undefined}
          aria-expanded={scanOpen}
          aria-haspopup="dialog"
          onClick={handleScan}
        >
          Scan library
        </button>
        <Link className="karaoke-link" to="/karaoke">
          Open Karaoke
        </Link>
        <UiScaleControl />
        {trailing ?? (
          <Link className="topbar-link icon-btn" to="/settings" title="Settings" aria-label="Settings">
            <FiSettings aria-hidden />
          </Link>
        )}
      </div>
    </header>
  );
}
