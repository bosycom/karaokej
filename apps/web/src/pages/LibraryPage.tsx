import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { LibraryStatusDto, TrackDto } from '@karaokej/shared';
import { api } from '../api';
import { Modal } from '../components/Modal';
import { formatDuration, lyricBadge } from '../format';
import { MODAL_IDS } from '../modals/dismissedModals';
import { useConfirmModal } from '../modals/useConfirmModal';
import { useSession, trackLabel } from '../session/SessionProvider';
import { PlayerBar } from '../components/PlayerBar';

export function LibraryPage() {
  const { state, connected, isPlayer, clientId } = useSession();
  const confirmModal = useConfirmModal();
  const [query, setQuery] = useState('');
  const [inputValue, setInputValue] = useState('');
  const [page, setPage] = useState(1);
  const [fetchingIds, setFetchingIds] = useState<Set<number>>(new Set());
  const [tracks, setTracks] = useState<TrackDto[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<LibraryStatusDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const limit = 50;

  const loadTracks = async (q: string, p: number) => {
    try {
      const result = await api.tracks(q, p, limit);
      setTracks(result.items);
      setTotal(result.total);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const loadStatus = async () => {
    try {
      setStatus(await api.libraryStatus());
    } catch {
      /* websocket will still show jobs */
    }
  };

  useEffect(() => {
    void loadTracks(query, page);
  }, [query, page]);

  useEffect(() => {
    void loadStatus();
  }, [state.jobs.scan.running, state.jobs.lyricsFetch.running, state.jobs.scan.message]);

  const onSearch = (event: FormEvent) => {
    event.preventDefault();
    setPage(1);
    setQuery(inputValue);
  };

  const resetSearch = () => {
    setInputValue('');
    setQuery('');
    setPage(1);
  };

  const fetchTrackLyrics = async (trackId: number) => {
    setFetchingIds((prev) => new Set(prev).add(trackId));
    try {
      await api.fetchTrackLyrics(trackId);
      await loadTracks(query, page);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setFetchingIds((prev) => {
        const next = new Set(prev);
        next.delete(trackId);
        return next;
      });
    }
  };

  const handleScanClick = () => {
    if (state.jobs.scan.running) {
      void api.cancelScan();
      return;
    }
    confirmModal.request(MODAL_IDS.scanHelp, () => api.scan());
  };

  const handleFetchLyricsClick = () => {
    if (state.jobs.lyricsFetch.running) {
      void api.cancelFetchLyrics();
      return;
    }
    confirmModal.request(MODAL_IDS.lyricsHelp, () => api.fetchLyrics());
  };

  const pages = Math.max(1, Math.ceil(total / limit));
  const modalCopy =
    confirmModal.dismissId === MODAL_IDS.scanHelp
      ? {
          title: 'Scan library',
          confirmLabel: 'Start scan',
          body: (
            <ul className="modal-help-list">
              <li>
                Walks <code>MUSIC_LIBRARY_PATH</code> for <code>.mp3</code>,{' '}
                <code>.flac</code>, and <code>.opus</code> files.
              </li>
              <li>
                Reads tags and duration, updates the catalogue, and removes tracks
                that are no longer on disk.
              </li>
              <li>
                Detects sidecar <code>.lrc</code> files next to audio files; it
                does not download lyrics.
              </li>
              <li>Large libraries take time. Progress appears in the toolbar.</li>
            </ul>
          ),
        }
      : confirmModal.dismissId === MODAL_IDS.lyricsHelp
        ? {
            title: 'Fetch missing lyrics',
            confirmLabel: 'Start fetch',
            body: (
              <ul className="modal-help-list">
                <li>
                  Queries LRCLIB for tracks that still need lyrics, including retries
                  for older &ldquo;not found&rdquo; results after a week.
                </li>
                <li>Writes <code>.lrc</code> files next to the audio files.</li>
                <li>
                  Skips tracks that already have lyrics. Requests are rate-limited, so
                  a full pass can take a while.
                </li>
                <li>The same toolbar button cancels a running fetch.</li>
              </ul>
            ),
          }
        : null;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Local karaoke appliance</p>
          <h1>Karaokej</h1>
        </div>
        <div className="topbar-actions">
          <span className={`pill ${connected ? 'ok' : 'warn'}`}>
            {connected ? 'Live' : 'Reconnecting'}
          </span>
          <span className={`pill ${isPlayer ? 'ok' : 'muted'}`}>
            {isPlayer ? 'This device plays audio' : 'Follow only'}
          </span>
          {!isPlayer && (
            <button type="button" onClick={() => void api.claim(clientId)}>
              Play audio here
            </button>
          )}
          <Link className="topbar-link" to="/settings">
            Settings
          </Link>
          <Link className="karaoke-link" to="/karaoke">
            Open Karaoke
          </Link>
        </div>
      </header>

      <section className="toolbar">
        <button
          type="button"
          disabled={!state.jobs.scan.running && !status?.libraryConfigured}
          onClick={handleScanClick}
        >
          {state.jobs.scan.running ? 'Cancel scan' : 'Scan library'}
        </button>
        <button
          type="button"
          disabled={
            !state.jobs.lyricsFetch.running && (status?.trackCount ?? 0) === 0
          }
          onClick={handleFetchLyricsClick}
        >
          {state.jobs.lyricsFetch.running
            ? 'Cancel lyrics'
            : 'Fetch missing lyrics'}
        </button>
        <p className="status-copy">
          {status?.libraryConfigured
            ? `${status.trackCount} tracks · ${status.withLyrics} with lyrics`
            : 'Set MUSIC_LIBRARY_PATH in .env and restart the server.'}
          {state.jobs.scan.message ? ` · ${state.jobs.scan.message}` : ''}
          {state.jobs.lyricsFetch.running && state.jobs.lyricsFetch.message
            ? ` · ${state.jobs.lyricsFetch.message}`
            : ''}
        </p>
      </section>

      {error && <p className="error-banner">{error}</p>}

      <div className="workspace">
        <section className="library-pane">
          <form className="search" onSubmit={onSearch}>
            <input
              name="q"
              placeholder="Search title, artist, album"
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              autoComplete="off"
            />
            <button
              type="button"
              disabled={inputValue === '' && query === ''}
              onClick={resetSearch}
            >
              Reset
            </button>
            <button type="submit">Search</button>
          </form>
          {tracks.length === 0 ? (
            <p className="empty">No songs match. Scan the library if it is empty.</p>
          ) : (
            <ul className="track-list">
              {tracks.map((track) => {
                const badge = lyricBadge(track.lyricStatus);
                return (
                  <li key={track.id}>
                    <div>
                      <strong>{track.title}</strong>
                      <span>
                        {track.artist ?? 'Unknown artist'}
                        {track.album ? ` · ${track.album}` : ''}
                      </span>
                    </div>
                    <div className="track-meta">
                      <span className={`badge ${badge.tone}`}>{badge.label}</span>
                      <span className="time">{formatDuration(track.durationMs)}</span>
                      <button
                        type="button"
                        disabled={
                          track.lyricStatus === 'present' ||
                          fetchingIds.has(track.id)
                        }
                        onClick={() => void fetchTrackLyrics(track.id)}
                      >
                        {fetchingIds.has(track.id) ? 'Fetching…' : 'Fetch lyrics'}
                      </button>
                      <button type="button" onClick={() => void api.addToQueue(track.id)}>
                        Queue
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="pager">
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </button>
            <span>
              Page {page} / {pages} · {total} songs
            </span>
            <button
              type="button"
              disabled={page >= pages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </section>

        <aside className="queue-pane">
          <h2>Queue</h2>
          {state.queue.length === 0 ? (
            <p className="empty">Queue is empty. Add a song from the library.</p>
          ) : (
            <ol className="queue-list">
              {state.queue.map((item, index) => {
                const current = item.id === state.playback.currentQueueItemId;
                return (
                  <li key={item.id} className={current ? 'current' : ''}>
                    <button
                      type="button"
                      className="queue-title"
                      onClick={() => void api.playItem(item.id)}
                    >
                      {trackLabel(item.track)}
                    </button>
                    <div className="queue-actions">
                      <button
                        type="button"
                        disabled={index === 0}
                        onClick={() => void api.moveQueue(item.id, 'up')}
                      >
                        Up
                      </button>
                      <button
                        type="button"
                        disabled={index === state.queue.length - 1}
                        onClick={() => void api.moveQueue(item.id, 'down')}
                      >
                        Down
                      </button>
                      <button type="button" onClick={() => void api.removeFromQueue(item.id)}>
                        Remove
                      </button>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </aside>
      </div>

      {modalCopy && (
        <Modal
          open={confirmModal.open}
          title={modalCopy.title}
          confirmLabel={modalCopy.confirmLabel}
          permanentlyDismissible
          onConfirm={confirmModal.confirm}
          onCancel={confirmModal.cancel}
        >
          {modalCopy.body}
        </Modal>
      )}

      <PlayerBar />
    </div>
  );
}
