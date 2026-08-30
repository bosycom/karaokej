import { useEffect, useId, useRef, useState } from 'react';
import { FiMoreVertical } from 'react-icons/fi';

export interface IconMenuItem {
  id: string;
  label: string;
  variant?: 'default' | 'danger';
  onSelect: () => void | Promise<void>;
}

interface IconMenuProps {
  items: IconMenuItem[];
  ariaLabel: string;
}

export function IconMenu({ items, ariaLabel }: IconMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) {
      return;
    }

    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const handleSelect = async (item: IconMenuItem) => {
    await item.onSelect();
    setOpen(false);
  };

  return (
    <div className="icon-menu" ref={rootRef}>
      <button
        type="button"
        className="icon-btn"
        title={ariaLabel}
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
      >
        <FiMoreVertical aria-hidden />
      </button>
      {open ? (
        <div
          id={menuId}
          className="icon-menu-panel"
          role="menu"
          aria-label={ariaLabel}
        >
          {items.map((item) => (
            <IconMenuOption key={item.id} item={item} onSelect={handleSelect} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function IconMenuOption({
  item,
  onSelect,
}: {
  item: IconMenuItem;
  onSelect: (item: IconMenuItem) => void | Promise<void>;
}) {
  return (
    <button
      type="button"
      className={
        item.variant === 'danger'
          ? 'icon-menu-item icon-menu-item-danger'
          : 'icon-menu-item'
      }
      role="menuitem"
      onClick={() => void onSelect(item)}
    >
      {item.label}
    </button>
  );
}
