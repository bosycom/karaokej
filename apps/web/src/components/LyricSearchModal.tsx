import { FormEvent, useEffect, useState } from 'react';
import { LyricSearchHitDto, TrackDto } from '@karaokej/shared';
import { api } from '../api';
import { formatDuration } from '../format';
import { ModalDialog } from './ModalDialog';
import { ProcessingText } from './ProcessingText';

interface LyricSearchModalProps {
  open: boolean;
  track: TrackDto | null;
  onClose: () => void;
  onApplied?: () => void;
  closeOnBackdropClick?: boolean;
}

type SearchPhase = 'idle' | 'searching' | 'done';

function defaultSearchQuery(track: TrackDto): string {
  return [track.artist, track.title].filter(Boolean).join(' ');
}

export function LyricSearchModal({
  open,
  track,
  onClose,
  onApplied,
  closeOnBackdropClick,
}: LyricSearchModalProps) {
  const [query, setQuery] = useState('');
  const [phase, setPhase] = useState<SearchPhase>('idle');
  const [hits, setHits] = useState<LyricSearchHitDto[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !track) {
      return;
    }
    setQuery(defaultSearchQuery(track));
    setPhase('idle');
    setHits([]);
    setSelectedId(null);
    setError(null);
    setSaving(false);
  }, [open, track?.id]);

  const runSearch = async () => {
    if (!track) {
      return;
    }
    const trimmed = query.trim();
    if (!trimmed) {
      setError('Enter a search term');
      return;
    }
    setPhase('searching');
    setError(null);
    setHits([]);
    setSelectedId(null);
    try {
      const result = await api.searchTrackLyrics(track.id, trimmed);
      setHits(result.hits);
      setPhase('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase('idle');
    }
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    void runSearch();
  };

  const handleSave = async () => {
    if (!track || selectedId == null) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.applyTrackLyrics(track.id, selectedId);
      onApplied?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const trackLabel = track
    ? [track.artist, track.title].filter(Boolean).join(' — ')
    : '';

  return (
    <ModalDialog
      open={open}
      title="Search lyrics"
      onClose={onClose}
      closeOnBackdropClick={closeOnBackdropClick}
      closeDisabled={saving}
      panelClassName="modal-panel-tall"
    >
        <div className="modal-body">
          {track && (
            <p>
              No synced lyrics were found automatically for{' '}
              <strong>{trackLabel}</strong>. Edit the search term and try again.
            </p>
          )}
        </div>

        <form className="lyric-search-form" onSubmit={handleSubmit}>
          <input
            type="search"
            className="lyric-search-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search title, artist, album…"
            autoFocus
          />
          <button type="submit" disabled={phase === 'searching' || saving}>
            Search
          </button>
        </form>

        {error && <p className="lyric-search-error">{error}</p>}

        <div className="modal-issue-scroll lyric-search-results">
          {phase === 'idle' && (
            <p className="lyric-search-hint">Edit the search term and click Search.</p>
          )}
          {phase === 'searching' && (
            <p className="lyric-search-hint">
              <ProcessingText>Searching…</ProcessingText>
            </p>
          )}
          {phase === 'done' && hits.length === 0 && (
            <p className="lyric-search-hint">No synced lyrics found.</p>
          )}
          {phase === 'done' && hits.length > 0 && (
            <ul className="modal-issue-list lyric-search-list">
              {hits.map((hit) => {
                const selected = selectedId === hit.id;
                const meta = [
                  hit.artist,
                  hit.album,
                  hit.durationMs != null ? formatDuration(hit.durationMs) : null,
                ]
                  .filter(Boolean)
                  .join(' · ');
                return (
                  <li key={hit.id}>
                    <button
                      type="button"
                      className={`lyric-search-hit${selected ? ' selected' : ''}`}
                      onClick={() => setSelectedId(hit.id)}
                      aria-pressed={selected}
                    >
                      <div className="lyric-search-hit-title">{hit.title}</div>
                      <div className="lyric-search-hit-meta">{meta}</div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="modal-actions">
          <button type="button" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            type="button"
            className="modal-primary"
            disabled={selectedId == null || saving}
            onClick={() => void handleSave()}
          >
            {saving ? 'Saving…' : 'Save lyrics'}
          </button>
        </div>
    </ModalDialog>
  );
}
