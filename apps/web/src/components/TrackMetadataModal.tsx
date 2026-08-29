import { FormEvent, useEffect, useState } from 'react';
import { TrackDto, TrackMetadataDto } from '@karaokej/shared';
import { api } from '../api';
import { formatDuration } from '../format';
import { ModalDialog } from './ModalDialog';
import { ProcessingText } from './ProcessingText';
import { StarRating } from './StarRating';

interface TrackMetadataModalProps {
  open: boolean;
  track: TrackDto | null;
  onClose: () => void;
  onSaved?: (track: TrackDto) => void;
  closeOnBackdropClick?: boolean;
}

type LoadPhase = 'idle' | 'loading' | 'ready' | 'error';

function genresToInput(genres: string[]): string {
  return genres.join(', ');
}

export function TrackMetadataModal({
  open,
  track,
  onClose,
  onSaved,
  closeOnBackdropClick,
}: TrackMetadataModalProps) {
  const [phase, setPhase] = useState<LoadPhase>('idle');
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [album, setAlbum] = useState('');
  const [albumArtist, setAlbumArtist] = useState('');
  const [trackNo, setTrackNo] = useState('');
  const [year, setYear] = useState('');
  const [genres, setGenres] = useState('');
  const [rating, setRating] = useState(0);
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !track) {
      return;
    }
    setPhase('loading');
    setError(null);
    setSaving(false);
    void api
      .readTrackMetadata(track.id)
      .then((metadata: TrackMetadataDto) => {
        setTitle(metadata.title);
        setArtist(metadata.artist ?? '');
        setAlbum(metadata.album ?? '');
        setAlbumArtist(metadata.albumArtist ?? '');
        setTrackNo(metadata.trackNo != null ? String(metadata.trackNo) : '');
        setYear(metadata.year != null ? String(metadata.year) : '');
        setGenres(genresToInput(metadata.genres));
        setRating(metadata.rating);
        setDurationMs(metadata.durationMs);
        setPhase('ready');
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
        setPhase('error');
      });
  }, [open, track?.id]);

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    if (!track || phase !== 'ready') {
      return;
    }
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError('Title is required');
      return;
    }
    const parsedTrackNo = trackNo.trim() ? Number(trackNo.trim()) : null;
    if (
      trackNo.trim() &&
      (!Number.isInteger(parsedTrackNo) || (parsedTrackNo ?? 0) <= 0)
    ) {
      setError('Track number must be a positive integer');
      return;
    }
    const parsedYear = year.trim() ? Number(year.trim()) : null;
    if (
      year.trim() &&
      (!Number.isInteger(parsedYear) ||
        (parsedYear ?? 0) <= 0 ||
        (parsedYear ?? 0) > 9999)
    ) {
      setError('Year must be a valid four-digit year');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const updated = await api.updateTrackMetadata(track.id, {
        title: trimmedTitle,
        artist: artist.trim() || null,
        album: album.trim() || null,
        albumArtist: albumArtist.trim() || null,
        trackNo: parsedTrackNo,
        year: parsedYear,
        genres: genres
          .split(',')
          .map((genre) => genre.trim())
          .filter(Boolean),
        rating,
      });
      onSaved?.(updated);
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
      title="Edit metadata"
      onClose={onClose}
      closeOnBackdropClick={closeOnBackdropClick}
      closeDisabled={saving}
      panelClassName="modal-panel-tall"
      as="form"
      onSubmit={(event) => void handleSave(event)}
    >
        <div className="modal-body">
          {track && (
            <p>
              Editing tags for <strong>{trackLabel}</strong>
              {durationMs != null ? ` · ${formatDuration(durationMs)}` : null}
            </p>
          )}
        </div>

        {phase === 'loading' && (
          <p className="lyric-search-hint">
            <ProcessingText>Reading tags from file…</ProcessingText>
          </p>
        )}

        {phase === 'ready' && (
          <div className="metadata-form">
            <label>
              Title
              <input
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
              />
            </label>
            <label>
              Artist
              <input
                type="text"
                value={artist}
                onChange={(event) => setArtist(event.target.value)}
              />
            </label>
            <label>
              Album
              <input
                type="text"
                value={album}
                onChange={(event) => setAlbum(event.target.value)}
              />
            </label>
            <label>
              Album artist
              <input
                type="text"
                value={albumArtist}
                onChange={(event) => setAlbumArtist(event.target.value)}
              />
            </label>
            <label>
              Track number
              <input
                type="number"
                min={1}
                value={trackNo}
                onChange={(event) => setTrackNo(event.target.value)}
              />
            </label>
            <label>
              Year
              <input
                type="number"
                min={1}
                max={9999}
                value={year}
                onChange={(event) => setYear(event.target.value)}
              />
            </label>
            <label>
              Genres
              <input
                type="text"
                value={genres}
                onChange={(event) => setGenres(event.target.value)}
                placeholder="Pop, Rock"
              />
            </label>
            <div className="metadata-rating">
              <span>Rating</span>
              <StarRating
                value={rating}
                ariaLabel={`Rate ${title || track?.title || 'track'}`}
                onConfirm={setRating}
              />
            </div>
          </div>
        )}

        {error && <p className="lyric-search-error">{error}</p>}

        <div className="modal-actions">
          <button type="button" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            type="submit"
            className="modal-primary"
            disabled={phase !== 'ready' || saving}
          >
            {saving ? 'Saving…' : 'Save metadata'}
          </button>
        </div>
    </ModalDialog>
  );
}
