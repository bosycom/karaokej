import { FormEvent, useState } from 'react';
import { api } from '../api';

declare global {
  interface Window {
    karaokejDesktop?: {
      pickLibraryFolders: () => Promise<string[]>;
    };
  }
}

export function SetupPage({ onComplete }: { onComplete: () => void }) {
  const [paths, setPaths] = useState<string[]>([]);
  const [manualPath, setManualPath] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addManualPath = () => {
    const trimmed = manualPath.trim();
    if (!trimmed) {
      return;
    }
    setPaths((prev) => (prev.includes(trimmed) ? prev : [...prev, trimmed]));
    setManualPath('');
  };

  const pickFolders = async () => {
    setError(null);
    if (!window.karaokejDesktop?.pickLibraryFolders) {
      setError('Use the text field to enter Windows paths (e.g. D:\\Music).');
      return;
    }
    try {
      const picked = await window.karaokejDesktop.pickLibraryFolders();
      if (picked.length === 0) {
        return;
      }
      setPaths((prev) => {
        const next = [...prev];
        for (const folder of picked) {
          if (!next.includes(folder)) {
            next.push(folder);
          }
        }
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (paths.length === 0) {
      setError('Add at least one music library folder.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.librarySetup(paths);
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="setup-page">
      <div className="setup-card">
        <h1>Welcome to Karaokej</h1>
        <p>
          Choose one or more folders that contain your karaoke and music files. The catalogue and
          caches are stored next to the app in <code>data/</code>.
        </p>
        <p className="setup-hint">
          Phones and TVs on your network can open <strong>http://&lt;this-pc-ip&gt;:3000</strong>{' '}
          after setup. Use Windows paths like <code>D:\Music</code> when typing folders manually.
        </p>

        <form onSubmit={onSubmit}>
          <div className="setup-actions">
            <button type="button" className="secondary" onClick={() => void pickFolders()}>
              Choose folders…
            </button>
            <div className="setup-manual">
              <input
                type="text"
                className="setup-input"
                value={manualPath}
                onChange={(e) => setManualPath(e.target.value)}
                placeholder="D:\Music"
                aria-label="Library folder path"
              />
              <button type="button" className="secondary" onClick={addManualPath}>
                Add path
              </button>
            </div>
          </div>

          {paths.length > 0 ? (
            <ul className="setup-path-list">
              {paths.map((path) => (
                <li key={path}>
                  <span>{path}</span>
                  <button
                    type="button"
                    className="modal-secondary"
                    onClick={() => setPaths((prev) => prev.filter((p) => p !== path))}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="setup-empty">No library folders selected yet.</p>
          )}

          {error ? <p className="setup-error">{error}</p> : null}

          <button type="submit" className="primary" disabled={saving || paths.length === 0}>
            {saving ? 'Saving…' : 'Continue'}
          </button>
        </form>
      </div>
    </div>
  );
}
