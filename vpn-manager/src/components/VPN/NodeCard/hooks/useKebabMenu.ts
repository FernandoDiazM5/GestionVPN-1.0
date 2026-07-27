import { useState, useRef, useEffect } from 'react';

interface KebabCoords {
  top?: number;
  bottom?: number;
  right: number;
  maxHeight: number;
}

const MENU_WIDTH = 208;
const MENU_PREFERRED_HEIGHT = 520;
const MENU_GAP = 4;
const VIEWPORT_MARGIN = 8;

interface ViewportSize {
  width: number;
  height: number;
}

type AnchorRect = Pick<DOMRect, 'top' | 'right' | 'bottom'>;

export function calculateKebabCoords(
  rect: AnchorRect,
  viewport: ViewportSize,
): KebabCoords {
  const spaceBelow = Math.max(
    0,
    viewport.height - rect.bottom - MENU_GAP - VIEWPORT_MARGIN,
  );
  const spaceAbove = Math.max(
    0,
    rect.top - MENU_GAP - VIEWPORT_MARGIN,
  );
  const openAbove = (
    spaceBelow < MENU_PREFERRED_HEIGHT
    && spaceAbove > spaceBelow
  );

  const unclampedRight = viewport.width - rect.right;
  const maxRight = Math.max(
    VIEWPORT_MARGIN,
    viewport.width - MENU_WIDTH - VIEWPORT_MARGIN,
  );
  const right = Math.min(
    Math.max(unclampedRight, VIEWPORT_MARGIN),
    maxRight,
  );

  if (openAbove) {
    return {
      bottom: viewport.height - rect.top + MENU_GAP,
      right,
      maxHeight: spaceAbove,
    };
  }

  return {
    top: rect.bottom + MENU_GAP,
    right,
    maxHeight: spaceBelow,
  };
}

export function shouldCloseKebabOnScroll(
  target: EventTarget | null,
  menu: HTMLElement | null,
): boolean {
  return !(target instanceof Node && menu?.contains(target));
}

export function useKebabMenu() {
  const [showKebab, setShowKebab] = useState(false);
  const [kebabCoords, setKebabCoords] = useState<KebabCoords>({
    top: 0,
    right: VIEWPORT_MARGIN,
    maxHeight: 0,
  });
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
    const scrollHandler = (event: Event) => {
      if (shouldCloseKebabOnScroll(event.target, dropdownRef.current)) {
        setShowKebab(false);
      }
    };
    const resizeHandler = () => setShowKebab(false);
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
    window.addEventListener('resize', resizeHandler);
    return () => {
      cancelAnimationFrame(focusFrame);
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', keyHandler);
      window.removeEventListener('scroll', scrollHandler, true);
      window.removeEventListener('resize', resizeHandler);
    };
  }, [showKebab]);

  const handleKebabClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!showKebab) {
      const rect = e.currentTarget.getBoundingClientRect();
      setKebabCoords(calculateKebabCoords(rect, {
        width: window.innerWidth,
        height: window.innerHeight,
      }));
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
