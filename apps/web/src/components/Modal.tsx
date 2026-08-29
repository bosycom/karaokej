import { ReactNode, useEffect, useState } from 'react';
import { ModalDialog } from './ModalDialog';

interface ModalProps {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: (doNotShowAgain: boolean) => void;
  onCancel: () => void;
  permanentlyDismissible?: boolean;
  closeOnBackdropClick?: boolean;
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
  closeOnBackdropClick = false,
}: ModalProps) {
  const [doNotShowAgain, setDoNotShowAgain] = useState(false);

  useEffect(() => {
    if (open) {
      setDoNotShowAgain(false);
    }
  }, [open]);

  return (
    <ModalDialog
      open={open}
      title={title}
      onClose={onCancel}
      closeOnBackdropClick={closeOnBackdropClick}
    >
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
        <button type="button" onClick={onCancel}>
          {cancelLabel}
        </button>
        <button type="button" className="modal-primary" onClick={() => onConfirm(doNotShowAgain)}>
          {confirmLabel}
        </button>
      </div>
    </ModalDialog>
  );
}
