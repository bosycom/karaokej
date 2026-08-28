import { useState } from 'react';
import {
  TrackDto,
  YoutubeSearchHitDto,
  buildPlatformSearchUrls,
} from '@karaokej/shared';
import { api } from '../api';
import { formatDuration } from '../format';
import { ProcessingText } from './ProcessingText';

interface SearchMissFallbackProps {
  query: string;
  ytdlpAvailable: boolean;
  ytsaverAvailable: boolean;
  downloadRunning: boolean;
  downloadMessage: string | null;
  onTrackDownloaded: (track: TrackDto) => void;
}

type SearchPhase = 'idle' | 'searching' | 'done';

export function SearchMissFallback({
  query,
  ytdlpAvailable,
  ytsaverAvailable,
  downloadRunning,
  downloadMessage,
  onTrackDownloaded,
}: SearchMissFallbackProps) {
  const urls = buildPlatformSearchUrls(query);
  const [copied, setCopied] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [searchPhase, setSearchPhase] = useState<SearchPhase>('idle');
  const [hits, setHits] = useState<YoutubeSearchHitDto[]>([]);

  const copyYoutubeSearch = async () => {
    try {
      await navigator.clipboard.writeText(urls.youtube);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setLaunchError('Could not copy to clipboard');
    }
  };

  const openYtsaver = async () => {
    setLaunchError(null);
    setLaunching(true);
    try {
      await api.launchYtsaver();
    } catch (err) {
      setLaunchError(err instanceof Error ? err.message : String(err));
    } finally {
      setLaunching(false);
    }
  };

  const searchYoutube = async () => {
    setSearchError(null);
    setSearchPhase('searching');
    try {
      const result = await api.searchYoutube(query);
      setHits(result.hits);
      setSearchPhase('done');
    } catch (err) {
      setHits([]);
      setSearchPhase('done');
      setSearchError(err instanceof Error ? err.message : String(err));
    }
  };

  const downloadHit = async (hit: YoutubeSearchHitDto) => {
    setDownloadError(null);
    setDownloadingId(hit.id);
    try {
      const { track } = await api.downloadYoutube(hit.id);
      onTrackDownloaded(track);
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : String(err));
    } finally {
      setDownloadingId(null);
    }
  };

  const showYtsaverFallback =
    !ytdlpAvailable || Boolean(downloadError) || Boolean(searchError);

  return (
    <div className="search-miss-fallback">
      <p className="search-miss-lead">
        No library match for <strong>{query}</strong>.
      </p>

      <section className="search-miss-section">
        <h3 className="search-miss-heading">Play elsewhere</h3>
        <p className="search-miss-copy">Search these platforms in a new tab:</p>
        <ul className="search-miss-links">
          <li>
            <a href={urls.youtube} target="_blank" rel="noreferrer">
              YouTube
            </a>
          </li>
          <li>
            <a href={urls.spotify} target="_blank" rel="noreferrer">
              Spotify
            </a>
          </li>
          <li>
            <a href={urls.vimeo} target="_blank" rel="noreferrer">
              Vimeo
            </a>
          </li>
        </ul>
      </section>

      <section className="search-miss-section search-miss-download">
        <h3 className="search-miss-heading">Download</h3>
        {ytdlpAvailable ? (
          <>
            <p className="search-miss-copy">
              Search YouTube, pick a result, and download it as MP3 into your library&apos;s
              Downloads folder.
            </p>
            <div className="search-miss-actions">
              <button
                type="button"
                disabled={searchPhase === 'searching' || downloadRunning}
                onClick={() => void searchYoutube()}
              >
                {searchPhase === 'searching' ? (
                  <ProcessingText>Searching YouTube…</ProcessingText>
                ) : (
                  'Search YouTube'
                )}
              </button>
            </div>
            {downloadRunning && downloadMessage ? (
              <p className="search-miss-hint">
                <ProcessingText>{downloadMessage}</ProcessingText>
              </p>
            ) : null}
            {searchError && <p className="search-miss-error">{searchError}</p>}
            {downloadError && <p className="search-miss-error">{downloadError}</p>}
            {searchPhase === 'done' && hits.length === 0 && !searchError ? (
              <p className="search-miss-hint">No YouTube results found.</p>
            ) : null}
            {hits.length > 0 ? (
              <ul className="search-miss-hit-list">
                {hits.map((hit) => {
                  const meta = [
                    hit.uploader,
                    hit.durationMs != null ? formatDuration(hit.durationMs) : null,
                  ]
                    .filter(Boolean)
                    .join(' · ');
                  const busy =
                    downloadRunning ||
                    downloadingId === hit.id ||
                    downloadingId != null;
                  return (
                    <li key={hit.id} className="search-miss-hit">
                      <div className="search-miss-hit-text">
                        <div className="search-miss-hit-title">{hit.title}</div>
                        {meta ? (
                          <div className="search-miss-hit-meta">{meta}</div>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void downloadHit(hit)}
                      >
                        {downloadingId === hit.id || downloadRunning ? (
                          <ProcessingText>Downloading…</ProcessingText>
                        ) : (
                          'Download MP3'
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </>
        ) : (
          <p className="search-miss-hint">
            yt-dlp is not available on this host. Set <code>YTDLP_PATH</code> in .env if it
            is installed elsewhere.
          </p>
        )}
      </section>

      {showYtsaverFallback ? (
        <section className="search-miss-section search-miss-ytsaver">
          <h3 className="search-miss-heading">YT Saver fallback</h3>
          <p className="search-miss-copy">
            Open a YouTube result, copy that video&apos;s URL, paste it into YT Saver,
            then scan the library to add the file.
          </p>
          <div className="search-miss-actions">
            <button type="button" onClick={() => void copyYoutubeSearch()}>
              {copied ? 'Copied' : 'Copy YouTube search link'}
            </button>
            <button
              type="button"
              disabled={!ytsaverAvailable || launching}
              title={
                ytsaverAvailable
                  ? 'Launch YT Saver on the Karaokej host'
                  : 'YT Saver was not found on the server'
              }
              onClick={() => void openYtsaver()}
            >
              {launching ? <ProcessingText>Opening…</ProcessingText> : 'Open YT Saver'}
            </button>
          </div>
          {!ytsaverAvailable && (
            <p className="search-miss-hint">
              YT Saver is not available on this host. Set <code>YTSAVER_PATH</code> in
              .env if it is installed elsewhere.
            </p>
          )}
          {launchError && <p className="search-miss-error">{launchError}</p>}
        </section>
      ) : null}
    </div>
  );
}
