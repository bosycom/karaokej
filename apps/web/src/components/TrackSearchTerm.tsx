import { KeyboardEvent, PointerEvent } from 'react';

interface TrackSearchTermProps {
  term: string;
  onApplySearchTerm: (term: string) => void;
}

export function TrackSearchTerm({ term, onApplySearchTerm }: TrackSearchTermProps) {
  const stopDrag = (event: PointerEvent<HTMLSpanElement>) => {
    event.stopPropagation();
  };

  const apply = () => {
    onApplySearchTerm(term);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      apply();
    }
  };

  return (
    <span
      role="button"
      tabIndex={0}
      className="track-search-term"
      title="Use as search term"
      onPointerDown={stopDrag}
      onClick={apply}
      onKeyDown={onKeyDown}
    >
      {term}
    </span>
  );
}
