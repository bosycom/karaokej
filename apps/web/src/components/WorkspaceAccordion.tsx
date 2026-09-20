import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { FiChevronDown } from 'react-icons/fi';

export type WorkspacePaneId = 'library' | 'playlists' | 'queue';

interface WorkspaceAccordionValue {
  enabled: boolean;
  openPane: WorkspacePaneId;
  isOpen: (pane: WorkspacePaneId) => boolean;
  selectPane: (pane: WorkspacePaneId) => void;
}

const WorkspaceAccordionContext = createContext<WorkspaceAccordionValue | null>(
  null,
);

const MOBILE_ACCORDION_QUERY = '(max-width: 900px)';

export function WorkspaceAccordionProvider({ children }: { children: ReactNode }) {
  const [openPane, setOpenPane] = useState<WorkspacePaneId>('library');
  const [enabled, setEnabled] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia(MOBILE_ACCORDION_QUERY).matches
      : false,
  );

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_ACCORDION_QUERY);
    const onChange = () => setEnabled(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const selectPane = useCallback((pane: WorkspacePaneId) => {
    setOpenPane(pane);
  }, []);

  const isOpen = useCallback(
    (pane: WorkspacePaneId) => !enabled || openPane === pane,
    [enabled, openPane],
  );

  const value = useMemo(
    () => ({ enabled, openPane, isOpen, selectPane }),
    [enabled, openPane, isOpen, selectPane],
  );

  return (
    <WorkspaceAccordionContext.Provider value={value}>
      {children}
    </WorkspaceAccordionContext.Provider>
  );
}

export function useWorkspaceAccordion(): WorkspaceAccordionValue {
  const value = useContext(WorkspaceAccordionContext);
  if (!value) {
    return {
      enabled: false,
      openPane: 'library',
      isOpen: () => true,
      selectPane: () => undefined,
    };
  }
  return value;
}

export function paneAccordionClass(
  pane: WorkspacePaneId,
  accordion: WorkspaceAccordionValue,
): string {
  if (!accordion.enabled) {
    return '';
  }
  return accordion.isOpen(pane) ? ' is-accordion-open' : ' is-accordion-collapsed';
}

export function PaneAccordionTrigger({
  pane,
  children,
}: {
  pane: WorkspacePaneId;
  children: ReactNode;
}) {
  const accordion = useWorkspaceAccordion();
  const open = accordion.isOpen(pane);

  if (!accordion.enabled) {
    return <>{children}</>;
  }

  return (
    <button
      type="button"
      className={`pane-accordion-trigger${open ? ' is-open' : ''}`}
      aria-expanded={open}
      onClick={() => accordion.selectPane(pane)}
    >
      {children}
      <FiChevronDown aria-hidden className="pane-accordion-chevron" />
    </button>
  );
}
