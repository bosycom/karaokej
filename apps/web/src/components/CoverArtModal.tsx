import { useEffect, useState } from 'react';
import {
  ArtistBioChoiceDto,
  ArtistBioDto,
  TrackDto,
} from '@karaokej/shared';
import { api } from '../api';
import { formatTrackSubtitle } from '../format';
import { CoverArt } from './CoverArt';
import { ModalDialog } from './ModalDialog';
import { ProcessingText } from './ProcessingText';
import { TrackSearchTerm } from './TrackSearchTerm';

interface CoverArtModalProps {
  track: TrackDto | null;
  onClose: () => void;
  onSearch?: (term: string) => void;
}

const LARGE_COVER_PX = 640;

function BioChip({
  term,
  onSearch,
}: {
  term: string;
  onSearch?: (term: string) => void;
}) {
  if (onSearch) {
    return (
      <TrackSearchTerm
        term={term}
        onApplySearchTerm={(value) => {
          onSearch(value);
        }}
      />
    );
  }
  return <span className="artist-bio-chip-static">{term}</span>;
}

function ArtistBioSection({
  bio,
  loading,
  error,
  onRetry,
  onSearch,
  onChoose,
}: {
  bio: ArtistBioDto | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onSearch?: (term: string) => void;
  onChoose: (choice: ArtistBioChoiceDto) => void;
}) {
  if (loading) {
    return (
      <div className="artist-bio-state">
        <ProcessingText>Fetching biography…</ProcessingText>
      </div>
    );
  }

  if (error) {
    return (
      <div className="artist-bio-state artist-bio-error">
        <p>{error}</p>
        <button type="button" className="modal-secondary" onClick={onRetry}>
          Retry
        </button>
      </div>
    );
  }

  if (!bio) {
    return null;
  }

  if (bio.status === 'no_artist') {
    return <p className="artist-bio-state">No artist tag available.</p>;
  }

  if (bio.status === 'ambiguous') {
    return (
      <div className="artist-bio-choices">
        <p>Multiple artists match. Choose one:</p>
        <ul>
          {bio.choices.map((choice) => (
            <li key={`${choice.audiodbId ?? 'local'}-${choice.name}`}>
              <button
                type="button"
                className="artist-bio-choice"
                onClick={() => onChoose(choice)}
              >
                <strong>{choice.name}</strong>
                {[choice.country, choice.genre, choice.formedYear]
                  .filter(Boolean)
                  .join(' · ')}
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (bio.status === 'not_found') {
    return (
      <div className="artist-bio-state">
        <p>
          A previous search did not find any biography. Do you want to try the
          search again?
        </p>
        <button type="button" className="modal-secondary" onClick={onRetry}>
          Try again
        </button>
      </div>
    );
  }

  const metaChips = [bio.genre, bio.style, bio.mood, bio.country].filter(
    (value): value is string => Boolean(value),
  );

  const handleChipClick = (term: string) => {
    if (!onSearch) {
      return;
    }
    onSearch(term);
  };

  return (
    <div className="artist-bio-content">
      {bio.displayName ? (
        <h3 className="artist-bio-name">{bio.displayName}</h3>
      ) : null}
      {bio.formedYear ? (
        <p className="artist-bio-formed">Formed {bio.formedYear}</p>
      ) : null}
      {metaChips.length > 0 ? (
        <div className="artist-bio-chips">
          {metaChips.map((term) => (
            <BioChip
              key={term}
              term={term}
              onSearch={
                onSearch
                  ? (value) => {
                      handleChipClick(value);
                    }
                  : undefined
              }
            />
          ))}
        </div>
      ) : null}
      {bio.albums.length > 0 ? (
        <div className="artist-bio-group">
          <h4>Other albums</h4>
          <div className="artist-bio-chips">
            {bio.albums.map((album) => (
              <BioChip
                key={`${album.name}-${album.year ?? ''}`}
                term={album.name}
                onSearch={
                  onSearch
                    ? (value) => {
                        handleChipClick(value);
                      }
                    : undefined
                }
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ArtistBioDetails({
  bio,
  onSearch,
}: {
  bio: ArtistBioDto;
  onSearch?: (term: string) => void;
}) {
  if (bio.status !== 'ready') {
    return null;
  }

  const hasBiography = Boolean(bio.biography);
  const hasTopTracks = bio.topTracks.length > 0;
  if (!hasBiography && !hasTopTracks) {
    return null;
  }

  return (
    <div className="cover-modal-details">
      {hasBiography ? (
        <div className="artist-bio-group cover-modal-bio">
          <h4>Biography</h4>
          <div className="artist-bio-text">{bio.biography}</div>
        </div>
      ) : null}
      {hasTopTracks ? (
        <div className="artist-bio-group artist-bio-top-tracks">
          <h4>Top track</h4>
          <ol className="artist-bio-top-tracks-list">
            {bio.topTracks.map((trackHit) => (
              <li key={trackHit.name}>
                {onSearch ? (
                  <TrackSearchTerm
                    term={trackHit.name}
                    onApplySearchTerm={onSearch}
                  />
                ) : (
                  trackHit.name
                )}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}

export function CoverArtModal({ track, onClose, onSearch }: CoverArtModalProps) {
  const [bio, setBio] = useState<ArtistBioDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!track) {
      setBio(null);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setBio(null);
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const result = await api.trackArtistBio(track.id);
        if (cancelled) {
          return;
        }
        setBio(result);
        if (result.status === 'ready' && result.topTracks.length === 0) {
          void api.trackArtistBioExtras(track.id).then((extras) => {
            if (!cancelled) {
              setBio(extras);
            }
          });
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [track?.id]);

  const handleRetry = () => {
    if (!track) {
      return;
    }
    setLoading(true);
    setError(null);
    void api
      .refreshTrackArtistBio(track.id)
      .then((result) => {
        setBio(result);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        setLoading(false);
      });
  };

  const handleChoose = (choice: ArtistBioChoiceDto) => {
    if (!track) {
      return;
    }
    setLoading(true);
    setError(null);
    void api
      .chooseTrackArtistBio(track.id, {
        name: choice.audiodbId ? undefined : choice.name,
        audiodbId: choice.audiodbId ?? undefined,
      })
      .then((result) => {
        setBio(result);
        if (result.status === 'ready') {
          return api.trackArtistBioExtras(track.id);
        }
        return result;
      })
      .then((result) => {
        if (result) {
          setBio(result);
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        setLoading(false);
      });
  };

  const handleSearch = (term: string) => {
    onSearch?.(term);
    onClose();
  };

  return (
    <ModalDialog
      open={Boolean(track)}
      title={track?.album ?? track?.title ?? 'Cover art'}
      onClose={onClose}
      closeOnBackdropClick
      panelClassName="cover-modal-panel"
    >
      {track ? (
        <div className="modal-body cover-modal-body">
          <div className="cover-modal-upper">
            <CoverArt
              track={track}
              size={LARGE_COVER_PX}
              variant="lg"
              className="cover-art-large"
            />
            <div className="cover-modal-meta">
              <p className="cover-modal-caption">{formatTrackSubtitle(track)}</p>
              <ArtistBioSection
                bio={bio}
                loading={loading}
                error={error}
                onRetry={handleRetry}
                onSearch={onSearch ? handleSearch : undefined}
                onChoose={handleChoose}
              />
            </div>
          </div>
          {bio ? (
            <ArtistBioDetails
              bio={bio}
              onSearch={onSearch ? handleSearch : undefined}
            />
          ) : null}
        </div>
      ) : null}
      <div className="modal-actions">
        {bio?.status === 'ready' ? (
          <button
            type="button"
            className="modal-secondary"
            onClick={handleRetry}
            disabled={loading}
          >
            Refresh info
          </button>
        ) : null}
        <button type="button" className="modal-primary" onClick={onClose}>
          Close
        </button>
      </div>
    </ModalDialog>
  );
}
