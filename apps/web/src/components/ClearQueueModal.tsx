import { useEffect, useRef } from 'react';

interface ClearQueueModalProps {
  open: boolean;
  currentTrackTitle: string | null;
  hasBeforeCurrent: boolean;
  onRemoveAll: () => void;
  onKeepCurrent: () => void;
  onRemoveBeforeCurrent: () => void;
  onCancel: () => void;
}

export function ClearQueueModal({
  open,
  currentTrackTitle,
  hasBeforeCurrent,
  onRemoveAll,
  onKeepCurrent,
  onRemoveBeforeCurrent,
  onCancel,
}: ClearQueueModalProps) {
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
        <h2 className="modal-title">Empty queue</h2>
        <div className="modal-body">
          <p>
            {currentTrackTitle ? (
              <>
                <strong>{currentTrackTitle}</strong> is playing. What should be removed from the
                queue?
              </>
            ) : (
              <>A song is playing. What should be removed from the queue?</>
            )}
          </p>
        </div>
        <div className="modal-actions modal-actions-multi">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" disabled={!hasBeforeCurrent} onClick={onRemoveBeforeCurrent}>
            Remove earlier songs
          </button>
          <button type="button" onClick={onKeepCurrent}>
            Keep current song
          </button>
          <button type="button" className="modal-primary" onClick={onRemoveAll}>
            Remove all
          </button>
        </div>
      </div>
    </dialog>
  );
}
