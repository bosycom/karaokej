import { useEffect, useId, useRef, useState } from 'react';
import { FiChevronDown } from 'react-icons/fi';
import { KaraokeMode } from '@karaokej/shared';
import { KaraokeModeControl } from './KaraokeModeControl';

interface VocalSettingsMenuProps {
  mode: KaraokeMode;
  disabled?: boolean;
  demucsAvailable?: boolean;
  onChange: (mode: KaraokeMode) => void;
}

export function VocalSettingsMenu({
  mode,
  disabled = false,
  demucsAvailable = false,
  onChange,
}: VocalSettingsMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) {
      return;
    }

    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="vocal-settings-menu" ref={rootRef}>
      <button
        type="button"
        className={open ? 'vocal-settings-trigger is-open' : 'vocal-settings-trigger'}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
      >
        Vocal settings
        <FiChevronDown aria-hidden />
      </button>
      {open ? (
        <div
          id={menuId}
          className="vocal-settings-panel"
          role="dialog"
          aria-label="Vocal settings"
        >
          <KaraokeModeControl
            mode={mode}
            disabled={disabled}
            demucsAvailable={demucsAvailable}
            onChange={onChange}
          />
        </div>
      ) : null}
    </div>
  );
}
