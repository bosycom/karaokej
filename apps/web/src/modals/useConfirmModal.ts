import { useCallback, useState } from 'react';
import { dismiss, isDismissed } from './dismissedModals';

type PendingAction = {
  dismissId: string;
  action: () => void | Promise<unknown>;
};

export function useConfirmModal() {
  const [pending, setPending] = useState<PendingAction | null>(null);

  const request = useCallback((dismissId: string, action: () => void | Promise<unknown>) => {
    if (isDismissed(dismissId)) {
      void action();
      return;
    }
    setPending({ dismissId, action });
  }, []);

  const confirm = useCallback(
    (doNotShowAgain: boolean) => {
      if (!pending) {
        return;
      }
      if (doNotShowAgain) {
        dismiss(pending.dismissId);
      }
      void pending.action();
      setPending(null);
    },
    [pending],
  );

  const cancel = useCallback(() => {
    setPending(null);
  }, []);

  return {
    open: pending !== null,
    dismissId: pending?.dismissId ?? null,
    request,
    confirm,
    cancel,
  };
}
