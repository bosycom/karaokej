const STORAGE_KEY = 'karaokej.dismissedModals';

export const MODAL_IDS = {
  scanHelp: 'scan-help-v2',
  lyricsHelp: 'lyrics-help',
} as const;

export type ModalId = (typeof MODAL_IDS)[keyof typeof MODAL_IDS];

export const KNOWN_MODALS: { id: ModalId; label: string }[] = [
  { id: MODAL_IDS.scanHelp, label: 'Scan library help' },
  { id: MODAL_IDS.lyricsHelp, label: 'Fetch missing lyrics help' },
];

function readDismissed(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((item): item is string => typeof item === 'string');
  } catch {
    return [];
  }
}

function writeDismissed(ids: string[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
}

export function getDismissedIds(): string[] {
  return readDismissed();
}

export function isDismissed(id: string): boolean {
  return readDismissed().includes(id);
}

export function dismiss(id: string): void {
  const current = readDismissed();
  if (current.includes(id)) {
    return;
  }
  writeDismissed([...current, id]);
}

export function resetDismissedModals(): void {
  localStorage.removeItem(STORAGE_KEY);
}
