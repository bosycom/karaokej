import { ModalDialog } from './ModalDialog';

interface ClearQueueModalProps {
  open: boolean;
  currentTrackTitle: string | null;
  hasBeforeCurrent: boolean;
  onRemoveAll: () => void;
  onKeepCurrent: () => void;
  onRemoveBeforeCurrent: () => void;
  onCancel: () => void;
  closeOnBackdropClick?: boolean;
}

export function ClearQueueModal({
  open,
  currentTrackTitle,
  hasBeforeCurrent,
  onRemoveAll,
  onKeepCurrent,
  onRemoveBeforeCurrent,
  onCancel,
  closeOnBackdropClick,
}: ClearQueueModalProps) {
  return (
    <ModalDialog
      open={open}
      title="Empty queue"
      onClose={onCancel}
      closeOnBackdropClick={closeOnBackdropClick}
    >
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
    </ModalDialog>
  );
}
