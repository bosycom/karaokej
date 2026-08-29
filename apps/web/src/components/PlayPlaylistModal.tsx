import { ModalDialog } from './ModalDialog';

interface PlayPlaylistModalProps {
  open: boolean;
  playlistName: string;
  onAppend: () => void;
  onReplace: () => void;
  onCancel: () => void;
  closeOnBackdropClick?: boolean;
}

export function PlayPlaylistModal({
  open,
  playlistName,
  onAppend,
  onReplace,
  onCancel,
  closeOnBackdropClick,
}: PlayPlaylistModalProps) {
  return (
    <ModalDialog
      open={open}
      title="Load playlist"
      onClose={onCancel}
      closeOnBackdropClick={closeOnBackdropClick}
    >
      <div className="modal-body">
        <p>
          The queue already has songs. How should <strong>{playlistName}</strong> be loaded?
        </p>
      </div>
      <div className="modal-actions modal-actions-multi">
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" onClick={onAppend}>
          Append
        </button>
        <button type="button" className="modal-primary" onClick={onReplace}>
          Replace
        </button>
      </div>
    </ModalDialog>
  );
}
