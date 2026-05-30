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

    document.addEventListener('mousedown', handler);
    window.addEventListener('scroll', scrollHandler, true);
    return () => {
      document.removeEventListener('mousedown', handler);
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
