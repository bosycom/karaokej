import { useEffect, useRef } from 'react';

interface PlayTrackModalProps {
  open: boolean;
  trackTitle: string;
  onPlayNow: () => void;
  onQueue: () => void;
  onCancel: () => void;
}

export function PlayTrackModal({
  open,
  trackTitle,
  onPlayNow,
  onQueue,
  onCancel,
}: PlayTrackModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className="modal"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) {
          onCancel();
        }
      }}
    >
      <div className="modal-panel">
        <h2 className="modal-title">Play song</h2>
        <div className="modal-body">
          <p>
            <strong>{trackTitle}</strong> is ready, but another song is playing. Play it now or
            add it to the queue?
          </p>
        </div>
        <div className="modal-actions modal-actions-multi">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" onClick={onQueue}>
            Queue
          </button>
          <button type="button" className="modal-primary" onClick={onPlayNow}>
            Play now
          </button>
        </div>
      </div>
    </dialog>
  );
}
