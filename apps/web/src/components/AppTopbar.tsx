import { ReactNode, useEffect, useId, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FiMenu, FiX } from 'react-icons/fi';
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
  extras?: ReactNode;
}

export function AppTopbar({
  eyebrow,
  title,
  scanOpen = false,
  onScan,
  trailing,
  extras,
}: AppTopbarProps) {
  const navigate = useNavigate();
  const { state } = useSession();
  const { karaoke, setMode } = useKaraoke();
  const status = useLibraryStatus();
  const [menuOpen, setMenuOpen] = useState(false);
  const actionsRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const libraryJobRunning =
    state.jobs.scan.running ||
    state.jobs.lyricsFetch.running ||
    state.jobs.covers.running;

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    const onPointerDown = (event: MouseEvent) => {
      if (!actionsRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  const handleScan = () => {
    setMenuOpen(false);
    if (onScan) {
      onScan();
      return;
    }
    navigate('/?scan=1');
  };

  return (
    <div className="topbar-actions" ref={actionsRef}>
      <button
        type="button"
        className="icon-btn topbar-menu-toggle"
        title={menuOpen ? 'Close menu' : 'Open menu'}
        aria-label={menuOpen ? 'Close menu' : 'Open menu'}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-controls={menuId}
        onClick={() => setMenuOpen((value) => !value)}
      >
        {menuOpen ? <FiX aria-hidden /> : <FiMenu aria-hidden />}
      </button>
      <div
        id={menuId}
        className={`topbar-actions-panel${menuOpen ? ' is-open' : ''}`}
        aria-label="App menu"
        onClick={(event) => {
          const target = event.target as HTMLElement;
          if (target.closest('a[href]') || target.closest('.toolbar-player')) {
            setMenuOpen(false);
          }
        }}
      >
        <VocalSettingsMenu
          mode={karaoke.mode}
          disabled={!state.playback.currentTrack}
          demucsAvailable={status?.demucsAvailable ?? false}
          onChange={setMode}
        />
        <button
          type="button"
          className={libraryJobRunning ? 'scan-btn-busy' : undefined}
          aria-expanded={scanOpen}
          aria-haspopup="dialog"
          onClick={handleScan}
        >
          Scan library
        </button>
        <Link className="topbar-panel-action" to="/karaoke">
          Open Karaoke
        </Link>
        {extras}
        <UiScaleControl />
        {trailing ?? (
          <Link className="topbar-link" to="/settings">
            Settings
          </Link>
        )}
        <div className="topbar-actions-brand">
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
        </div>
      </div>
    </div>
  );
}
