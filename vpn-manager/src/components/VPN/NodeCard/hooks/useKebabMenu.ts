import { useState, useRef, useEffect } from 'react';

interface KebabCoords {
  top?: number;
  bottom?: number;
  right: number;
}

export function useKebabMenu() {
  const [showKebab, setShowKebab] = useState(false);
  const [kebabCoords, setKebabCoords] = useState<KebabCoords>({ top: 0, right: 0 });
  const kebabRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showKebab) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        kebabRef.current && !kebabRef.current.contains(target) &&
        (!dropdownRef.current || !dropdownRef.current.contains(target))
      ) {
        setShowKebab(false);
      }
    };
    const scrollHandler = () => setShowKebab(false);
    const keyHandler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setShowKebab(false);
        requestAnimationFrame(() => kebabRef.current?.querySelector<HTMLButtonElement>('button')?.focus());
        return;
      }

      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      const menu = dropdownRef.current;
      if (!menu?.contains(document.activeElement)) return;
      const items = [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])')];
      if (items.length === 0) return;
      event.preventDefault();
      const current = items.indexOf(document.activeElement as HTMLElement);
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      items[(current + delta + items.length) % items.length]?.focus();
    };
    const focusFrame = requestAnimationFrame(() => {
      dropdownRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus();
    });

    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', keyHandler);
    window.addEventListener('scroll', scrollHandler, true);
    return () => {
      cancelAnimationFrame(focusFrame);
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', keyHandler);
      window.removeEventListener('scroll', scrollHandler, true);
    };
  }, [showKebab]);

  const handleKebabClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!showKebab) {
      const rect = e.currentTarget.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const MENU_HEIGHT = 280;
      if (spaceBelow < MENU_HEIGHT) {
        setKebabCoords({
          bottom: window.innerHeight - rect.top + 4,
          right: window.innerWidth - rect.right
        });
      } else {
        setKebabCoords({
          top: rect.bottom + 4,
          right: window.innerWidth - rect.right
        });
      }
    }
    setShowKebab(v => !v);
  };

  return {
    showKebab,
    setShowKebab,
    kebabCoords,
    kebabRef,
    dropdownRef,
    handleKebabClick,
  };
}
