import { FormEventHandler, ReactNode, useEffect, useRef } from 'react';
import { FiX } from 'react-icons/fi';

interface ModalDialogProps {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  closeOnBackdropClick?: boolean;
  closeDisabled?: boolean;
  panelClassName?: string;
  as?: 'div' | 'form';
  onSubmit?: FormEventHandler<HTMLFormElement>;
}

export function ModalDialog({
  open,
  title,
  children,
  onClose,
  closeOnBackdropClick = false,
  closeDisabled = false,
  panelClassName,
  as = 'div',
  onSubmit,
}: ModalDialogProps) {
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

  const panelClass = ['modal-panel', panelClassName].filter(Boolean).join(' ');
  const header = (
    <div className="modal-header">
      <h2 className="modal-title">{title}</h2>
      <button
        type="button"
        className="icon-btn modal-close"
        title="Close"
        aria-label="Close"
        disabled={closeDisabled}
        onClick={onClose}
      >
        <FiX aria-hidden />
      </button>
    </div>
  );

  return (
    <dialog
      ref={dialogRef}
      className="modal"
      onCancel={(event) => {
        event.preventDefault();
        if (!closeDisabled) {
          onClose();
        }
      }}
      onClick={(event) => {
        if (closeOnBackdropClick && !closeDisabled && event.target === dialogRef.current) {
          onClose();
        }
      }}
    >
      {as === 'form' ? (
        <form className={panelClass} onSubmit={onSubmit}>
          {header}
          {children}
        </form>
      ) : (
        <div className={panelClass}>
          {header}
          {children}
        </div>
      )}
    </dialog>
  );
}
