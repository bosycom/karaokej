import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { FiCheck } from 'react-icons/fi';

const STAR_PATH =
  'M12 2.4l2.7 5.8 6.3.8-4.6 4.3 1.2 6.2L12 16.6 6.4 19.5l1.2-6.2L3 9l6.3-.8z';

function unitsLabel(units: number): string {
  if (units <= 0) {
    return 'Unrated';
  }
  const stars = units / 2;
  return stars === 1 ? '1 star' : `${stars} stars`;
}

export function StarRating({
  value,
  onConfirm,
  disabled = false,
  compact = false,
  immediate = false,
  ariaLabel = 'Rating',
}: {
  value: number | null;
  onConfirm: (rating: number) => void | Promise<void>;
  disabled?: boolean;
  compact?: boolean;
  immediate?: boolean;
  ariaLabel?: string;
}) {
  const saved = value ?? 0;
  const clipId = useId().replace(/:/g, '');
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [pending, setPending] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const displayed = hover ?? pending ?? saved;
  const dirty = pending != null && pending !== saved;

  useEffect(() => {
    setPending(null);
    setHover(null);
  }, [saved]);

  useEffect(() => {
    if (!dirty) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setPending(null);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPending(null);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [dirty]);

  const apply = (next: number) => {
    if (disabled || saving) {
      return;
    }
    if (immediate) {
      if (next === saved) {
        void onConfirm(0);
      } else {
        void onConfirm(next);
      }
      return;
    }
    setPending(next === saved ? 0 : next);
  };

  const confirm = async () => {
    if (!dirty || disabled || saving || pending == null) {
      return;
    }
    setSaving(true);
    try {
      await onConfirm(pending);
      setPending(null);
    } finally {
      setSaving(false);
    }
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (disabled) {
      return;
    }
    if (event.key >= '1' && event.key <= '5') {
      event.preventDefault();
      apply(Number(event.key) * 2);
      return;
    }
    if (event.key === '0') {
      event.preventDefault();
      apply(0);
      return;
    }
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      event.preventDefault();
      apply(Math.min(10, (pending ?? saved) + 1));
      return;
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      event.preventDefault();
      apply(Math.max(0, (pending ?? saved) - 1));
      return;
    }
    if (event.key === 'Enter' && dirty) {
      event.preventDefault();
      void confirm();
    }
  };

  return (
    <div
      ref={rootRef}
      className={`star-rating${compact ? ' compact' : ''}${disabled ? ' disabled' : ''}`}
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
                onClick={() => apply(left)}
                tabIndex={-1}
                aria-label={unitsLabel(left)}
              />
              <button
                type="button"
                className="star-half right"
                disabled={disabled || saving}
                onMouseEnter={() => setHover(right)}
                onFocus={() => setHover(right)}
                onClick={() => apply(right)}
                tabIndex={-1}
                aria-label={unitsLabel(right)}
              />
            </span>
          );
        })}
      </div>
      {dirty && (
        <button
          type="button"
          className="icon-btn star-confirm"
          disabled={saving}
          onClick={() => void confirm()}
          title="Confirm rating"
          aria-label="Confirm rating"
        >
          <FiCheck aria-hidden />
        </button>
      )}
    </div>
  );
}
