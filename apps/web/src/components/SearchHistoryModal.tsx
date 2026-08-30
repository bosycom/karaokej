import { ModalDialog } from './ModalDialog';

interface SearchHistoryModalProps {
  open: boolean;
  terms: string[];
  onSelect: (term: string) => void;
  onClear: () => void;
  onClose: () => void;
  closeOnBackdropClick?: boolean;
}

export function SearchHistoryModal({
  open,
  terms,
  onSelect,
  onClear,
  onClose,
  closeOnBackdropClick,
}: SearchHistoryModalProps) {
  return (
    <ModalDialog
      open={open}
      title="History"
      onClose={onClose}
      closeOnBackdropClick={closeOnBackdropClick}
    >
      <div className="modal-body">
        {terms.length === 0 ? (
          <p>No recent searches.</p>
        ) : (
          <p>Click a search to run it again.</p>
        )}
      </div>
      {terms.length > 0 && (
        <div className="modal-issue-scroll">
          <ul className="modal-issue-list search-history-list">
            {terms.map((term, index) => (
              <li key={`${index}:${term}`}>
                <button
                  type="button"
                  className="search-history-term"
                  onClick={() => onSelect(term)}
                >
                  {term}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="modal-actions modal-actions-multi">
        <button type="button" disabled={terms.length === 0} onClick={onClear}>
          Clear history
        </button>
        <button type="button" className="modal-primary" onClick={onClose}>
          Close
        </button>
      </div>
    </ModalDialog>
  );
}
