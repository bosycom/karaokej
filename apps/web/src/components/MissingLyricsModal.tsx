import { useEffect, useRef, useState } from 'react';
import { TrackDto } from '@karaokej/shared';
import { ModalDialog } from './ModalDialog';

const AUTO_CONTINUE_SECONDS = 5;

interface MissingLyricsModalProps {
  open: boolean;
  track: TrackDto | null;
  onSearchLyrics: () => void;
  onContinue: () => void;
  onMarkUnavailable: () => void;
}

export function MissingLyricsModal({
  open,
  track,
  onSearchLyrics,
  onContinue,
  onMarkUnavailable,
}: MissingLyricsModalProps) {
  const [secondsLeft, setSecondsLeft] = useState(AUTO_CONTINUE_SECONDS);
  const timerRef = useRef<number | null>(null);
  const intervalRef = useRef<number | null>(null);

  const clearTimers = () => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (intervalRef.current != null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  useEffect(() => {
    clearTimers();
    if (!open) {
      setSecondsLeft(AUTO_CONTINUE_SECONDS);
      return;
    }

    setSecondsLeft(AUTO_CONTINUE_SECONDS);
    intervalRef.current = window.setInterval(() => {
      setSecondsLeft((current) => Math.max(0, current - 1));
    }, 1000);
    timerRef.current = window.setTimeout(() => {
      clearTimers();
      onContinue();
    }, AUTO_CONTINUE_SECONDS * 1000);

    return clearTimers;
  }, [open, track?.id, onContinue]);

  const trackLabel = track
    ? [track.artist, track.title].filter(Boolean).join(' — ')
    : '';

  const handleSearchLyrics = () => {
    clearTimers();
    onSearchLyrics();
  };

  const handleContinue = () => {
    clearTimers();
    onContinue();
  };

  const handleMarkUnavailable = () => {
    clearTimers();
    onMarkUnavailable();
  };

  return (
    <ModalDialog
      open={open}
      title="No lyrics found"
      onClose={handleContinue}
      closeOnBackdropClick={false}
    >
      <div className="modal-body">
        <p>
          No synced lyrics were found for <strong>{trackLabel}</strong>.
        </p>
        <p className="missing-lyrics-countdown">
          Continuing in {secondsLeft}…
        </p>
      </div>
      <div className="modal-actions modal-actions-multi">
        <button type="button" onClick={handleContinue}>
          Continue without lyrics
        </button>
        <button type="button" onClick={handleMarkUnavailable}>
          No lyrics available
        </button>
        <button type="button" className="modal-primary" onClick={handleSearchLyrics}>
          Search lyrics
        </button>
      </div>
    </ModalDialog>
  );
}
