import { useEffect, useState } from 'react';
import { FiMinus, FiPlus } from 'react-icons/fi';
import {
  formatUiScale,
  readUiScale,
  stepUiScale,
  UI_SCALE_EVENT,
  UI_SCALE_MAX,
  UI_SCALE_MIN,
  writeUiScale,
} from '../uiScale';

export function UiScaleControl() {
  const [scale, setScale] = useState(() => readUiScale());

  useEffect(() => {
    const sync = () => setScale(readUiScale());

    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === 'karaokej.uiScale') {
        sync();
      }
    };

    globalThis.addEventListener('storage', onStorage);
    globalThis.addEventListener(UI_SCALE_EVENT, sync);
    return () => {
      globalThis.removeEventListener('storage', onStorage);
      globalThis.removeEventListener(UI_SCALE_EVENT, sync);
    };
  }, []);

  const canDecrease = scale > UI_SCALE_MIN;
  const canIncrease = scale < UI_SCALE_MAX;
  const label = formatUiScale(scale);

  return (
    <div className="ui-scale-control" role="group" aria-label="UI size">
      <button
        type="button"
        className="icon-btn"
        title={`Decrease UI size (${label})`}
        aria-label={`Decrease UI size, currently ${label}`}
        disabled={!canDecrease}
        onClick={() => setScale(writeUiScale(stepUiScale(readUiScale(), -1)))}
      >
        <FiMinus aria-hidden />
      </button>
      <button
        type="button"
        className="icon-btn"
        title={`Increase UI size (${label})`}
        aria-label={`Increase UI size, currently ${label}`}
        disabled={!canIncrease}
        onClick={() => setScale(writeUiScale(stepUiScale(readUiScale(), 1)))}
      >
        <FiPlus aria-hidden />
      </button>
    </div>
  );
}
