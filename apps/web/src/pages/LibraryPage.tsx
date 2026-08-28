import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FiChevronLeft,
  FiChevronRight,
  FiChevronsLeft,
  FiChevronsRight,
  FiSettings,
} from 'react-icons/fi';
import { LuDices } from 'react-icons/lu';
import {
  LibraryStatusDto,
  PlaylistDetailDto,
  PlaylistQueueMode,
  PlaylistSummaryDto,
  ScanIssueDto,
  TrackDto,
} from '@karaokej/shared';
import { api } from '../api';
import { DraggableTrackRow } from '../components/DraggableTrackRow';
import {
  activeFilterCount,
  filtersButtonLabel,
  LibraryFiltersDraft,
  LibraryFiltersModal,
} from '../components/LibraryFiltersModal';
import { ClearQueueModal } from '../components/ClearQueueModal';
import { Modal } from '../components/Modal';
import { PlayerBar } from '../components/PlayerBar';
import { PlayPlaylistModal } from '../components/PlayPlaylistModal';
import { PlayTrackModal } from '../components/PlayTrackModal';
import { ProcessingText } from '../components/ProcessingText';
import { ScanIssuesModal } from '../components/ScanIssuesModal';
import { LyricSearchModal } from '../components/LyricSearchModal';
import { SearchMissFallback } from '../components/SearchMissFallback';
import { WorkspaceDnd } from '../components/WorkspaceDnd';
import { MODAL_IDS } from '../modals/dismissedModals';
import { useConfirmModal } from '../modals/useConfirmModal';
import { pageWindow } from '../pagination/pageWindow';
import { formatRelativeScanTime } from '../format';
import { useSession } from '../session/SessionProvider';

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
  const [minRating, setMinRating] = useState(0);
  const [hideDuplicates, setHideDuplicates] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filtersDraft, setFiltersDraft] = useState<LibraryFiltersDraft>({
    minRating: 0,
    hideDuplicates: false,
  });
  const [playlistSummaries, setPlaylistSummaries] = useState<PlaylistSummaryDto[]>([]);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<number | null>(null);
  const [playlistDetail, setPlaylistDetail] = useState<PlaylistDetailDto | null>(null);
  const [playModalPlaylistId, setPlayModalPlaylistId] = useState<number | null>(null);
  const [playModalTrack, setPlayModalTrack] = useState<TrackDto | null>(null);
  const [clearQueueModalOpen, setClearQueueModalOpen] = useState(false);
  const [scanIssues, setScanIssues] = useState<ScanIssueDto[]>([]);
  const [scanIssuesOpen, setScanIssuesOpen] = useState(false);
  const [lyricSearchTrack, setLyricSearchTrack] = useState<TrackDto | null>(null);
  const limit = 15;

  const loadTracks = async (
    q: string,
    p: number,
    rating = minRating,
    dedupe = hideDuplicates,
  ) => {
    try {
      const result = await api.tracks(q, p, limit, rating, dedupe);
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
    void loadTracks(query, page, minRating, hideDuplicates);
  }, [query, page, minRating, hideDuplicates]);

  const loadPlaylists = useCallback(async () => {
    try {
      const summaries = await api.playlists();
      setPlaylistSummaries(summaries);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const loadPlaylistDetail = useCallback(async (id: number) => {
    try {
      const detail = await api.playlist(id);
      setPlaylistDetail(detail);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void loadPlaylists();
  }, [loadPlaylists]);

  useEffect(() => {
    if (selectedPlaylistId != null) {
      void loadPlaylistDetail(selectedPlaylistId);
    } else {
      setPlaylistDetail(null);
    }
  }, [selectedPlaylistId, loadPlaylistDetail]);

  const prevScanRunning = useRef(false);
  const prevScanProgress = useRef({ current: 0, message: '' as string | null });

  useEffect(() => {
    if (prevScanRunning.current && !state.jobs.scan.running) {
      void loadTracks(query, page, minRating, hideDuplicates);
      if (selectedPlaylistId != null) {
        void loadPlaylistDetail(selectedPlaylistId);
      }
      void api.libraryStatus().then((next) => {
        setStatus(next);
        if (next.scanIssues.length > 0) {
          setScanIssues(next.scanIssues);
          setScanIssuesOpen(true);
        }
      }).catch(() => {
        /* status copy still updates from the existing effect */
      });
    }
    prevScanRunning.current = state.jobs.scan.running;
  }, [state.jobs.scan.running, query, page, minRating, hideDuplicates, selectedPlaylistId, loadPlaylistDetail]);

  useEffect(() => {
    if (!state.jobs.scan.running) {
      return;
    }
    const progress = {
      current: state.jobs.scan.current,
      message: state.jobs.scan.message,
    };
    const prev = prevScanProgress.current;
    if (progress.current === prev.current && progress.message === prev.message) {
      return;
    }
    prevScanProgress.current = progress;

    const timeout = window.setTimeout(() => {
      void loadTracks(query, page, minRating, hideDuplicates);
    }, 2000);
    return () => window.clearTimeout(timeout);
  }, [
    state.jobs.scan.running,
    state.jobs.scan.current,
    state.jobs.scan.message,
    query,
    page,
    minRating,
    hideDuplicates,
  ]);

  useEffect(() => {
    void loadStatus();
  }, [state.jobs.scan.running, state.jobs.lyricsFetch.running, state.jobs.scan.message]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setQuery(inputValue);
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [inputValue]);

  const onSearch = (event: FormEvent) => {
    event.preventDefault();
    setPage(1);
    setQuery(inputValue);
  };

  const resetSearch = () => {
    setInputValue('');
    setQuery('');
    setMinRating(0);
    setHideDuplicates(false);
    setPage(1);
  };

  const pickRandomArtist = async () => {
    try {
      const { artist } = await api.randomArtist(inputValue);
      setInputValue(artist);
      setQuery(artist);
      setPage(1);
    } catch {
      /* no artists in library — leave search unchanged */
    }
  };

  const appliedFilters: LibraryFiltersDraft = { minRating, hideDuplicates };
  const filterCount = activeFilterCount(appliedFilters);
  const searchIsClear =
    inputValue === '' &&
    query === '' &&
    minRating === 0 &&
    hideDuplicates === false;

  const openFilters = () => {
    setFiltersDraft(appliedFilters);
    setFiltersOpen(true);
  };

  const applyFilters = () => {
    setMinRating(filtersDraft.minRating);
    setHideDuplicates(filtersDraft.hideDuplicates);
    setPage(1);
    setFiltersOpen(false);
  };

  const setTrackRating = async (trackId: number, rating: number) => {
    try {
      const updated = await api.setTrackRating(trackId, rating);
      setTracks((prev) =>
        prev.map((track) => (track.id === trackId ? { ...track, rating: updated.rating } : track)),
      );
      if (minRating > 0 && (updated.rating ?? 0) < minRating) {
        await loadTracks(query, page, minRating);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const fetchTrackLyrics = async (trackId: number) => {
    setFetchingIds((prev) => new Set(prev).add(trackId));
    try {
      const updated = await api.fetchTrackLyrics(trackId);
      await loadTracks(query, page);
      if (updated.lyricStatus === 'not_found') {
        setLyricSearchTrack(updated);
      }
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

  const handleCreatePlaylist = async (name: string) => {
    try {
      const created = await api.createPlaylist(name);
      await loadPlaylists();
      setSelectedPlaylistId(created.id);
      setPlaylistDetail(created);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleRenamePlaylist = async (id: number, name: string) => {
    try {
      const updated = await api.updatePlaylist(id, { name });
      await loadPlaylists();
      if (selectedPlaylistId === id) {
        setPlaylistDetail(updated);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDeletePlaylist = (id: number) => {
    confirmModal.request(MODAL_IDS.playlistDelete, async () => {
      try {
        await api.deletePlaylist(id);
        await loadPlaylists();
        if (selectedPlaylistId === id) {
          setSelectedPlaylistId(null);
          setPlaylistDetail(null);
        }
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  };

  const handleRemovePlaylistItem = async (itemId: number) => {
    if (selectedPlaylistId == null) {
      return;
    }
    try {
      const updated = await api.removeFromPlaylist(selectedPlaylistId, itemId);
      setPlaylistDetail(updated);
      await loadPlaylists();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const loadPlaylistIntoQueue = async (playlistId: number, mode: PlaylistQueueMode) => {
    try {
      await api.loadPlaylistIntoQueue(playlistId, mode);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleClearQueue = () => {
    if (state.playback.status !== 'playing') {
      void (async () => {
        try {
          await api.clearQueue();
          setError(null);
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
        }
      })();
      return;
    }
    setClearQueueModalOpen(true);
  };

  const runClearQueue = async (mode: 'all' | 'except_current' | 'before_current') => {
    setClearQueueModalOpen(false);
    try {
      await api.clearQueue(mode);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handlePlayPlaylist = (playlistId: number) => {
    if (state.queue.length === 0) {
      void loadPlaylistIntoQueue(playlistId, 'replace');
      return;
    }
    setPlayModalPlaylistId(playlistId);
  };

  const handlePlayTrack = (track: TrackDto) => {
    if (state.playback.status === 'playing') {
      setPlayModalTrack(track);
      return;
    }
    void (async () => {
      try {
        await api.playTrackNow(track.id);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
  };

  const handlePlayTrackNow = () => {
    if (!playModalTrack) {
      return;
    }
    const trackId = playModalTrack.id;
    setPlayModalTrack(null);
    void (async () => {
      try {
        await api.playTrackNow(trackId);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
  };

  const handleQueueTrack = () => {
    if (!playModalTrack) {
      return;
    }
    const trackId = playModalTrack.id;
    setPlayModalTrack(null);
    void (async () => {
      try {
        await api.addToQueue(trackId);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
  };

  const playModalPlaylist = playlistSummaries.find(
    (entry) => entry.id === playModalPlaylistId,
  );

  const currentQueueIndex = state.queue.findIndex(
    (item) => item.id === state.playback.currentQueueItemId,
  );
  const hasQueueBeforeCurrent = currentQueueIndex > 0;

  const pages = Math.max(1, Math.ceil(total / limit));
  const visiblePages = pageWindow(page, pages);
  const modalCopy =
    confirmModal.dismissId === MODAL_IDS.scanHelp
      ? {
          title: 'Scan library',
          confirmLabel: 'Start scan',
          body: (
            <ul className="modal-help-list">
              <li>
                Walks each path in <code>MUSIC_LIBRARY_PATH</code> (comma-separated
                for multiple libraries) for <code>.mp3</code>, <code>.flac</code>,
                and <code>.opus</code> files.
              </li>
              <li>
                Reads tags and duration, updates the catalogue, and marks tracks
                missing from disk as unavailable.
              </li>
              <li>
                Detects sidecar <code>.lrc</code> files next to audio files; it
                does not download lyrics.
              </li>
              <li>
                Scans top-level folders in batches and shows progress in the
                toolbar (for example{' '}
                <code>Scanning Rock (3/12) · 1,200 files · ~85/s</code>
                ).
              </li>
              <li>
                Already-indexed files are skipped unless size or mtime changed;
                sidecar <code>.lrc</code> files are still checked each scan unless{' '}
                <code>LIBRARY_SCAN_SKIP_LRC_ON_UNCHANGED=1</code>.
              </li>
              <li>
                Cancelled scans resume from the last completed top-level folder on
                the next scan.
              </li>
              <li>
                Optional env tuning: chunk size, metadata concurrency, FS timeouts,
                and directory mtime skipping (often unreliable on Samba).
              </li>
              <li>
                Changing <code>MUSIC_LIBRARY_PATH</code> (adding libraries, or
                moving a root to a parent or child folder after restart) rebases
                catalogue paths in batches before scanning.
              </li>
              <li>Tracks appear in the library as each batch completes.</li>
              <li>
                If folders or files cannot be read, a scrollable list appears when
                the scan finishes.
              </li>
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
        : confirmModal.dismissId === MODAL_IDS.playlistDelete
          ? {
              title: 'Delete playlist',
              confirmLabel: 'Delete',
              body: (
                <p>
                  This permanently deletes the playlist and its item order. Audio files
                  in your library are not affected.
                </p>
              ),
            }
          : null;

  const scanJob = state.jobs.scan;
  const scanProgress =
    scanJob.running && scanJob.total > 0
      ? Math.min(100, Math.round((scanJob.current / scanJob.total) * 100))
      : null;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Perhaps I can&apos;t sing well, but it is...</p>
          <h1>Karaokej</h1>
        </div>
        <div className="topbar-actions">
          <span className={`pill ${connected ? 'ok' : 'warn'}`}>
            {connected ? 'Live' : <ProcessingText>Reconnecting</ProcessingText>}
          </span>
          <span className={`pill ${isPlayer ? 'ok' : 'muted'}`}>
            {isPlayer ? 'This device plays audio' : 'Follow only'}
          </span>
          {!isPlayer && (
            <button type="button" onClick={() => void api.claim(clientId)}>
              Play audio here
            </button>
          )}
          <Link className="topbar-link icon-btn" to="/settings" title="Settings" aria-label="Settings">
            <FiSettings aria-hidden />
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
        <div className="toolbar-status">
          <p className="status-copy">
            {status?.libraryConfigured
              ? `${status.trackCount} tracks · ${status.withLyrics} with lyrics · Last full scan: ${formatRelativeScanTime(status.lastFullScanAt)}`
              : 'Set MUSIC_LIBRARY_PATH in .env (comma-separated for multiple libraries) and restart the server.'}
            {scanJob.message ? (
              <>
                {' · '}
                {scanJob.running ? (
                  <ProcessingText>{scanJob.message}</ProcessingText>
                ) : (
                  scanJob.message
                )}
              </>
            ) : null}
            {state.jobs.lyricsFetch.running && state.jobs.lyricsFetch.message ? (
              <>
                {' · '}
                <ProcessingText>{state.jobs.lyricsFetch.message}</ProcessingText>
              </>
            ) : null}
            {state.jobs.download.running && state.jobs.download.message ? (
              <>
                {' · '}
                <ProcessingText>{state.jobs.download.message}</ProcessingText>
              </>
            ) : null}
          </p>
          {scanJob.running ? (
            <div
              className={`scan-progress${scanProgress == null ? ' scan-progress-indeterminate' : ''}`}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={scanProgress ?? undefined}
              aria-label="Library scan progress"
            >
              <span
                className="scan-progress-bar"
                style={scanProgress == null ? undefined : { width: `${scanProgress}%` }}
              />
            </div>
          ) : null}
        </div>
      </section>

      {error && <p className="error-banner">{error}</p>}

      <WorkspaceDnd
        tracks={tracks}
        queue={state.queue}
        currentQueueItemId={state.playback.currentQueueItemId}
        playlistSummaries={playlistSummaries}
        selectedPlaylistId={selectedPlaylistId}
        playlistDetail={playlistDetail}
        onSelectPlaylist={setSelectedPlaylistId}
        onCreatePlaylist={(name) => void handleCreatePlaylist(name)}
        onRenamePlaylist={(id, name) => void handleRenamePlaylist(id, name)}
        onDeletePlaylist={handleDeletePlaylist}
        onRemovePlaylistItem={(itemId) => void handleRemovePlaylistItem(itemId)}
        onPlayPlaylist={handlePlayPlaylist}
        onClearQueue={handleClearQueue}
        onPlaylistChanged={setPlaylistDetail}
        onPlaylistsRefresh={() => void loadPlaylists()}
        library={
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
                className="icon-btn"
                onClick={() => void pickRandomArtist()}
                title="Random"
                aria-label="Random"
              >
                <LuDices aria-hidden />
              </button>
              <button type="button" onClick={openFilters}>
                {filtersButtonLabel(filterCount)}
              </button>
              <button type="button" disabled={searchIsClear} onClick={resetSearch}>
                Reset
              </button>
            </form>
            {tracks.length === 0 ? (
              query.trim() ? (
                <SearchMissFallback
                  query={query.trim()}
                  ytdlpAvailable={status?.ytdlpAvailable ?? false}
                  ytsaverAvailable={status?.ytsaverAvailable ?? false}
                  downloadRunning={state.jobs.download.running}
                  downloadMessage={state.jobs.download.message}
                  onTrackDownloaded={(track) => {
                    void loadTracks(query, page, minRating, hideDuplicates);
                    handlePlayTrack(track);
                  }}
                />
              ) : (
                <p className="empty">No songs match. Scan the library if it is empty.</p>
              )
            ) : (
              <ul className="track-list">
                {tracks.map((track) => (
                  <DraggableTrackRow
                    key={track.id}
                    track={track}
                    fetching={fetchingIds.has(track.id)}
                    onFetchLyrics={(trackId) => void fetchTrackLyrics(trackId)}
                    onRate={setTrackRating}
                    onApplySearchTerm={setInputValue}
                    onPlay={handlePlayTrack}
                  />
                ))}
              </ul>
            )}
            <div className="pager">
              <button
                type="button"
                className="icon-btn"
                disabled={page <= 1}
                onClick={() => setPage(1)}
                title="First"
                aria-label="First"
              >
                <FiChevronsLeft aria-hidden />
              </button>
              <button
                type="button"
                className="icon-btn"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                title="Previous"
                aria-label="Previous"
              >
                <FiChevronLeft aria-hidden />
              </button>
              <div className="pager-pages">
                {visiblePages.map((p) =>
                  p === page ? (
                    <span key={p} className="pager-current" aria-current="page">
                      {p}
                    </span>
                  ) : (
                    <button key={p} type="button" className="pager-page" onClick={() => setPage(p)}>
                      {p}
                    </button>
                  ),
                )}
              </div>
              <button
                type="button"
                className="icon-btn"
                disabled={page >= pages}
                onClick={() => setPage((p) => p + 1)}
                title="Next"
                aria-label="Next"
              >
                <FiChevronRight aria-hidden />
              </button>
              <button
                type="button"
                className="icon-btn"
                disabled={page >= pages}
                onClick={() => setPage(pages)}
                title="Last"
                aria-label="Last"
              >
                <FiChevronsRight aria-hidden />
              </button>
              <span className="pager-summary">
                Page {page} / {pages} · {total} songs
              </span>
            </div>
          </section>
        }
      />

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

      <ScanIssuesModal
        open={scanIssuesOpen}
        issues={scanIssues}
        onClose={() => setScanIssuesOpen(false)}
      />

      {playModalPlaylist && (
        <PlayPlaylistModal
          open={playModalPlaylistId != null}
          playlistName={playModalPlaylist.name}
          onAppend={() => {
            void loadPlaylistIntoQueue(playModalPlaylist.id, 'append');
            setPlayModalPlaylistId(null);
          }}
          onReplace={() => {
            void loadPlaylistIntoQueue(playModalPlaylist.id, 'replace');
            setPlayModalPlaylistId(null);
          }}
          onCancel={() => setPlayModalPlaylistId(null)}
        />
      )}

      {playModalTrack && (
        <PlayTrackModal
          open={playModalTrack != null}
          trackTitle={playModalTrack.title}
          onPlayNow={handlePlayTrackNow}
          onQueue={handleQueueTrack}
          onCancel={() => setPlayModalTrack(null)}
        />
      )}

      <ClearQueueModal
        open={clearQueueModalOpen}
        currentTrackTitle={state.playback.currentTrack?.title ?? null}
        hasBeforeCurrent={hasQueueBeforeCurrent}
        onRemoveAll={() => void runClearQueue('all')}
        onKeepCurrent={() => void runClearQueue('except_current')}
        onRemoveBeforeCurrent={() => void runClearQueue('before_current')}
        onCancel={() => setClearQueueModalOpen(false)}
      />

      <LibraryFiltersModal
        open={filtersOpen}
        draft={filtersDraft}
        onDraftChange={setFiltersDraft}
        onApply={applyFilters}
        onCancel={() => setFiltersOpen(false)}
      />

      <LyricSearchModal
        open={lyricSearchTrack != null}
        track={lyricSearchTrack}
        onClose={() => setLyricSearchTrack(null)}
        onApplied={() => void loadTracks(query, page)}
      />

      <PlayerBar />
    </div>
  );
}
