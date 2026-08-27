import { ReactNode, useEffect, useRef, useState } from 'react';

interface ModalProps {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: (doNotShowAgain: boolean) => void;
  onCancel: () => void;
  permanentlyDismissible?: boolean;
}

export function Modal({
  open,
  title,
  children,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  permanentlyDismissible = false,
}: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [doNotShowAgain, setDoNotShowAgain] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    if (open && !dialog.open) {
      setDoNotShowAgain(false);
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const handleCancel = () => {
    onCancel();
  };

  const handleConfirm = () => {
    onConfirm(doNotShowAgain);
  };

  return (
    <dialog
      ref={dialogRef}
      className="modal"
      onCancel={(event) => {
        event.preventDefault();
        handleCancel();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) {
          handleCancel();
        }
      }}
    >
      <div className="modal-panel">
        <h2 className="modal-title">{title}</h2>
        <div className="modal-body">{children}</div>
        {permanentlyDismissible && (
          <label className="modal-dismiss">
            <input
              type="checkbox"
              checked={doNotShowAgain}
              onChange={(event) => setDoNotShowAgain(event.target.checked)}
            />
            Do not show again
          </label>
        )}
        <div className="modal-actions">
          <button type="button" onClick={handleCancel}>
            {cancelLabel}
          </button>
          <button type="button" className="modal-primary" onClick={handleConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
