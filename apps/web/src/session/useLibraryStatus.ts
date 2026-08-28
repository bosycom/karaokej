import { useEffect, useState } from 'react';
import { LibraryStatusDto } from '@karaokej/shared';
import { api } from '../api';

export function useLibraryStatus(): LibraryStatusDto | null {
  const [status, setStatus] = useState<LibraryStatusDto | null>(null);

  useEffect(() => {
    void api.libraryStatus().then(setStatus).catch(() => {
      /* leave null */
    });
  }, []);

  return status;
}
