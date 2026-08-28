import { ScanIssueDto } from '@karaokej/shared';
import { useEffect, useRef } from 'react';

interface ScanIssuesModalProps {
  open: boolean;
  issues: ScanIssueDto[];
  onClose: () => void;
}

function issueReason(op: ScanIssueDto['op']): string {
  switch (op) {
    case 'readdir':
      return 'Folder could not be read';
    case 'stat':
      return 'File could not be read';
    case 'exists':
      return 'Lyrics sidecar could not be checked';
    case 'parse':
      return 'Tags could not be read';
    default:
      return 'Could not be scanned';
  }
}

export function ScanIssuesModal({ open, issues, onClose }: ScanIssuesModalProps) {
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

  const countLabel = `${issues.length.toLocaleString()} ${
    issues.length === 1 ? 'path' : 'paths'
  }`;

  return (
    <dialog
      ref={dialogRef}
      className="modal"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) {
          onClose();
        }
      }}
    >
      <div className="modal-panel modal-panel-tall">
        <h2 className="modal-title">Skipped or unscannable files</h2>
        <div className="modal-body">
          <p>
            The scan finished, but {countLabel} could not be scanned. Scroll the
            list to review them.
          </p>
        </div>
        <div className="modal-issue-scroll">
          <ul className="modal-issue-list">
            {issues.map((issue, index) => (
              <li key={`${issue.op}:${issue.path}:${index}`}>
                <div className="modal-issue-path">{issue.path}</div>
                <div className="modal-issue-reason">
                  {issueReason(issue.op)}
                  {issue.message ? ` · ${issue.message}` : ''}
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="modal-actions">
          <button type="button" className="modal-primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </dialog>
  );
}
