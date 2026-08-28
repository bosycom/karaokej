import { Modal } from './Modal';
import { StarRating } from './StarRating';

export interface LibraryFiltersDraft {
  minRating: number;
  hideDuplicates: boolean;
}

interface LibraryFiltersModalProps {
  open: boolean;
  draft: LibraryFiltersDraft;
  onDraftChange: (draft: LibraryFiltersDraft) => void;
  onApply: () => void;
  onCancel: () => void;
}

export function LibraryFiltersModal({
  open,
  draft,
  onDraftChange,
  onApply,
  onCancel,
}: LibraryFiltersModalProps) {
  return (
    <Modal
      open={open}
      title="Filters"
      confirmLabel="Apply"
      cancelLabel="Cancel"
      onConfirm={() => onApply()}
      onCancel={onCancel}
    >
      <div className="filters-modal">
        <label className="filters-modal-row">
          <span className="filters-modal-label">Minimum rating</span>
          <StarRating
            value={draft.minRating}
            immediate
            compact
            ariaLabel="Minimum rating"
            onConfirm={(rating) =>
              onDraftChange({ ...draft, minRating: rating })
            }
          />
        </label>
        <div className="filters-modal-row filters-modal-toggle-row">
          <div>
            <span className="filters-modal-label">Hide duplicate formats</span>
            <p className="filters-modal-help">
              Keeps one file when artist, title, and length match (for example mp3
              and opus).
            </p>
          </div>
          <button
            type="button"
            className="filter-toggle"
            aria-pressed={draft.hideDuplicates}
            onClick={() =>
              onDraftChange({
                ...draft,
                hideDuplicates: !draft.hideDuplicates,
              })
            }
          >
            {draft.hideDuplicates ? 'On' : 'Off'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function activeFilterCount(filters: LibraryFiltersDraft): number {
  let count = 0;
  if (filters.minRating > 0) {
    count += 1;
  }
  if (filters.hideDuplicates) {
    count += 1;
  }
  return count;
}

export function filtersButtonLabel(count: number): string {
  if (count === 0) {
    return 'Filters';
  }
  if (count === 1) {
    return '1 Filter';
  }
  return `${count} Filters`;
}
