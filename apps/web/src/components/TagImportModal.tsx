import { useState } from 'react';
import { api } from '../api';
import { ModalDialog } from './ModalDialog';

interface TagImportModalProps {
  names: string[];
  onClose: () => void;
  onImported: () => void;
}

export function TagImportModal({ names, onClose, onImported }: TagImportModalProps) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(names));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const toggle = (name: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  const importSelected = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await api.importTags([...selected]);
      if (result.skipped.length > 0 && result.imported.length === 0) {
        setError('None of the selected names could be added. The tag list may be full.');
        return;
      }
      onImported();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalDialog open title="Import tags from files" onClose={onClose}>
      <div className="modal-body tag-picker">
        <p className="settings-copy">
          These mood names were found in audio files and are not in the tag list yet.
          Choose which ones to add. Songs that already carry a chosen name will show it.
        </p>
        <ul className="tag-picker-list">
          {names.map((name) => (
            <li key={name}>
              <label>
                <input
                  type="checkbox"
                  checked={selected.has(name)}
                  onChange={() => toggle(name)}
                />
                {name}
              </label>
            </li>
          ))}
        </ul>
        {error ? <p className="settings-feedback error">{error}</p> : null}
      </div>
      <div className="modal-actions">
        <button type="button" onClick={onClose}>
          Skip
        </button>
        <button
          type="button"
          className="modal-primary"
          disabled={busy || selected.size === 0}
          onClick={() => void importSelected()}
        >
          Import selected
        </button>
      </div>
    </ModalDialog>
  );
}
