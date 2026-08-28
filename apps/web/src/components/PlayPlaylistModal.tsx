import { useEffect, useRef } from 'react';

interface PlayPlaylistModalProps {
  open: boolean;
  playlistName: string;
  onAppend: () => void;
  onReplace: () => void;
  onCancel: () => void;
}

export function PlayPlaylistModal({
  open,
  playlistName,
  onAppend,
  onReplace,
  onCancel,
}: PlayPlaylistModalProps) {
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
        <h2 className="modal-title">Load playlist</h2>
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
      </div>
    </dialog>
  );
}
