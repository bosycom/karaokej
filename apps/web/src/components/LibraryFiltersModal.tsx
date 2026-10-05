import { useEffect, useState } from 'react';
import { tagKey } from '@karaokej/shared';
import { api } from '../api';
import { Modal } from './Modal';
import { StarRating } from './StarRating';

export interface LibraryFiltersDraft {
  minRating: number;
  hideDuplicates: boolean;
  tags: string[];
}

interface LibraryFiltersModalProps {
  open: boolean;
  draft: LibraryFiltersDraft;
  onDraftChange: (draft: LibraryFiltersDraft) => void;
  onApply: () => void;
  onCancel: () => void;
  closeOnBackdropClick?: boolean;
}

export function LibraryFiltersModal({
  open,
  draft,
  onDraftChange,
  onApply,
  onCancel,
  closeOnBackdropClick,
}: LibraryFiltersModalProps) {
  const [catalog, setCatalog] = useState<string[]>([]);
  const [tagQuery, setTagQuery] = useState('');

  useEffect(() => {
    if (!open) {
      setTagQuery('');
      return;
    }
    let cancelled = false;
    void api.tags().then((list) => {
      if (!cancelled) {
        setCatalog(list.tags.map((tag) => tag.name));
      }
    }).catch(() => {
      /* autocomplete stays empty */
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const needle = tagQuery.trim().toLowerCase();
  const suggestions = needle
    ? catalog
        .filter(
          (name) =>
            name.toLowerCase().startsWith(needle) &&
            !draft.tags.some((chosen) => tagKey(chosen) === tagKey(name)),
        )
        .slice(0, 8)
    : [];

  const addTag = (name: string) => {
    onDraftChange({ ...draft, tags: [...draft.tags, name] });
    setTagQuery('');
  };

  return (
    <Modal
      open={open}
      title="Filters"
      confirmLabel="Apply"
      cancelLabel="Cancel"
      onConfirm={() => onApply()}
      onCancel={onCancel}
      closeOnBackdropClick={closeOnBackdropClick}
    >
      <div className="filters-modal">
        <div className="filters-modal-row filters-modal-tags">
          <div>
            <span className="filters-modal-label">Tags</span>
            <p className="filters-modal-help">
              A song matches when it has every chosen tag.
            </p>
          </div>
          <div className="tag-filter">
            {draft.tags.length > 0 ? (
              <ul className="tag-filter-chips">
                {draft.tags.map((name) => (
                  <li key={tagKey(name)}>
                    <button
                      type="button"
                      onClick={() =>
                        onDraftChange({
                          ...draft,
                          tags: draft.tags.filter((item) => tagKey(item) !== tagKey(name)),
                        })
                      }
                    >
                      {name} <span aria-hidden>×</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <input
              type="text"
              value={tagQuery}
              autoComplete="off"
              aria-label="Filter by tag"
              placeholder="Type a tag"
              onChange={(event) => setTagQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Backspace' && tagQuery === '' && draft.tags.length > 0) {
                  onDraftChange({ ...draft, tags: draft.tags.slice(0, -1) });
                }
                if (event.key === 'Enter' && suggestions[0]) {
                  event.preventDefault();
                  addTag(suggestions[0]);
                }
              }}
            />
            {suggestions.length > 0 ? (
              <ul className="tag-filter-suggestions" role="listbox">
                {suggestions.map((name) => (
                  <li key={tagKey(name)}>
                    <button type="button" onClick={() => addTag(name)}>
                      {name}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
        <label className="filters-modal-row">
          <span className="filters-modal-label">Minimum rating</span>
          <StarRating
            value={draft.minRating}
            alwaysExpanded
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
  count += filters.tags.length;
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
