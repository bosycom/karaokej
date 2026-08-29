import { ScanIssueDto } from '@karaokej/shared';
import { ModalDialog } from './ModalDialog';

interface ScanIssuesModalProps {
  open: boolean;
  issues: ScanIssueDto[];
  onClose: () => void;
  closeOnBackdropClick?: boolean;
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

export function ScanIssuesModal({
  open,
  issues,
  onClose,
  closeOnBackdropClick,
}: ScanIssuesModalProps) {
  const countLabel = `${issues.length.toLocaleString()} ${
    issues.length === 1 ? 'path' : 'paths'
  }`;

  return (
    <ModalDialog
      open={open}
      title="Skipped or unscannable files"
      onClose={onClose}
      closeOnBackdropClick={closeOnBackdropClick}
      panelClassName="modal-panel-tall"
    >
      <div className="modal-body">
        <p>
          The scan finished, but {countLabel} could not be scanned. Scroll the list to review
          them.
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
    </ModalDialog>
  );
}
