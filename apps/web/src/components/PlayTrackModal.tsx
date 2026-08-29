import { ModalDialog } from './ModalDialog';

interface PlayTrackModalProps {
  open: boolean;
  trackTitle: string;
  onPlayNow: () => void;
  onQueue: () => void;
  onCancel: () => void;
  closeOnBackdropClick?: boolean;
}

export function PlayTrackModal({
  open,
  trackTitle,
  onPlayNow,
  onQueue,
  onCancel,
  closeOnBackdropClick,
}: PlayTrackModalProps) {
  return (
    <ModalDialog
      open={open}
      title="Play song"
      onClose={onCancel}
      closeOnBackdropClick={closeOnBackdropClick}
    >
      <div className="modal-body">
        <p>
          <strong>{trackTitle}</strong> is ready, but another song is playing. Play it now or add
          it to the queue?
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
    </ModalDialog>
  );
}
