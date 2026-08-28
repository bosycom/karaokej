import { useEffect, useState } from 'react';
import {
  BACKGROUND_MODE_EVENT,
  BackgroundMode,
  readBackgroundMode,
} from './backgroundMode';

export function useBackgroundMode(): BackgroundMode {
  const [mode, setMode] = useState<BackgroundMode>(() => readBackgroundMode());

  useEffect(() => {
    const sync = () => setMode(readBackgroundMode());

    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === 'karaokej.backgroundMode') {
        sync();
      }
    };

    const onCustom = () => sync();

    globalThis.addEventListener('storage', onStorage);
    globalThis.addEventListener(BACKGROUND_MODE_EVENT, onCustom);
    return () => {
      globalThis.removeEventListener('storage', onStorage);
      globalThis.removeEventListener(BACKGROUND_MODE_EVENT, onCustom);
    };
  }, []);

  return mode;
}
