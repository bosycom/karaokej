import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { ProcessingText } from './ProcessingText';
import {
  formatRatingLabel,
  ratingTone,
  unitsLabel,
} from './starRatingDisplay';

const STAR_PATH =
  'M12 2.4l2.7 5.8 6.3.8-4.6 4.3 1.2 6.2L12 16.6 6.4 19.5l1.2-6.2L3 9l6.3-.8z';

export function StarRating({
  value,
  onConfirm,
  disabled = false,
  compact = false,
  alwaysExpanded = false,
  ariaLabel = 'Rating',
}: {
  value: number | null;
  onConfirm: (rating: number) => void | Promise<void>;
  disabled?: boolean;
  compact?: boolean;
  /** Always show the 5-star picker (e.g. minimum-rating filter). */
  alwaysExpanded?: boolean;
  ariaLabel?: string;
}) {
  const saved = value ?? 0;
  const clipId = useId().replace(/:/g, '');
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [editing, setEditing] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const displayed = hover ?? saved;
  const viewLabel = formatRatingLabel(saved);
  const tone = ratingTone(saved);

  useEffect(() => {
    if (!alwaysExpanded) {
      setEditing(false);
    }
    setHover(null);
  }, [saved, alwaysExpanded]);

  useEffect(() => {
    if (alwaysExpanded || !editing) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setEditing(false);
        setHover(null);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setEditing(false);
        setHover(null);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [alwaysExpanded, editing]);

  const apply = async (next: number) => {
    if (disabled || saving) {
      return;
    }
    const rating = next === saved ? 0 : next;
    setSaving(true);
    try {
      await onConfirm(rating);
      setEditing(false);
      setHover(null);
    } finally {
      setSaving(false);
    }
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (disabled || saving) {
      return;
    }
    if (event.key >= '1' && event.key <= '5') {
      event.preventDefault();
      void apply(Number(event.key) * 2);
      return;
    }
    if (event.key === '0') {
      event.preventDefault();
      void apply(0);
      return;
    }
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      event.preventDefault();
      void apply(Math.min(10, saved + 1));
      return;
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      event.preventDefault();
      void apply(Math.max(0, saved - 1));
      return;
    }
  };

  const openEditor = () => {
    if (disabled || saving) {
      return;
    }
    setEditing(true);
  };

  if (saving) {
    return (
      <div
        ref={rootRef}
        className={`star-rating star-rating-applying${compact ? ' compact' : ''}`}
        aria-live="polite"
        aria-busy="true"
      >
        <ProcessingText>Applying…</ProcessingText>
      </div>
    );
  }

  if (!alwaysExpanded && !editing) {
    const viewAria =
      saved > 0
        ? `${ariaLabel}: ${unitsLabel(saved)}. Click to change rating.`
        : `${ariaLabel}: Unrated. Click to set rating.`;

    return (
      <div
        ref={rootRef}
        className={`star-rating star-rating-view-mode${disabled ? ' disabled' : ''}`}
      >
        <button
          type="button"
          className={`star-rating-view star-rating-tone-${tone}`}
          disabled={disabled || saving}
          aria-label={viewAria}
          title={saved > 0 ? unitsLabel(saved) : 'Unrated'}
          onClick={openEditor}
        >
          <svg className="star-shape" viewBox="0 0 24 24" aria-hidden>
            {saved > 0 ? (
              <path className="star-fill" d={STAR_PATH} />
            ) : (
              <path className="star-empty" d={STAR_PATH} />
            )}
            <path className="star-stroke" d={STAR_PATH} />
          </svg>
          {viewLabel ? (
            <span className="star-rating-view-label">{viewLabel}</span>
          ) : null}
        </button>
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className={`star-rating star-rating-edit-mode${compact ? ' compact' : ''}${disabled ? ' disabled' : ''}`}
      onMouseLeave={() => setHover(null)}
    >
      <div
        className="star-rating-control"
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={ariaLabel}
        aria-valuemin={0}
        aria-valuemax={10}
        aria-valuenow={displayed}
        aria-valuetext={unitsLabel(displayed)}
        aria-disabled={disabled}
        onKeyDown={onKeyDown}
      >
        {Array.from({ length: 5 }, (_, index) => {
          const left = index * 2 + 1;
          const right = index * 2 + 2;
          const fill =
            displayed >= right ? 1 : displayed >= left ? 0.5 : 0;
          return (
            <span key={index} className="star-slot">
              <svg className="star-shape" viewBox="0 0 24 24" aria-hidden>
                <defs>
                  <clipPath id={`${clipId}-${index}`}>
                    <rect x="0" y="0" width={fill === 1 ? 24 : 12} height="24" />
                  </clipPath>
                </defs>
                <path className="star-empty" d={STAR_PATH} />
                {fill > 0 && (
                  <path
                    className="star-fill"
                    d={STAR_PATH}
                    clipPath={`url(#${clipId}-${index})`}
                  />
                )}
                <path className="star-stroke" d={STAR_PATH} />
              </svg>
              <button
                type="button"
                className="star-half left"
                disabled={disabled || saving}
                onMouseEnter={() => setHover(left)}
                onFocus={() => setHover(left)}
                onClick={() => void apply(left)}
                tabIndex={-1}
                aria-label={unitsLabel(left)}
              />
              <button
                type="button"
                className="star-half right"
                disabled={disabled || saving}
                onMouseEnter={() => setHover(right)}
                onFocus={() => setHover(right)}
                onClick={() => void apply(right)}
                tabIndex={-1}
                aria-label={unitsLabel(right)}
              />
            </span>
          );
        })}
      </div>
    </div>
  );
}
