import {
  type ElementType,
  type MouseEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useId,
  useRef,
} from 'react';
import { createPortal } from 'react-dom';
import { getOverlayRoot, isTopOverlay, mountOverlay, unmountOverlay } from './overlayManager';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function isVisible(element: HTMLElement) {
  if (element.closest('[hidden], [aria-hidden="true"], .hidden')) return false;
  const style = window.getComputedStyle(element);
  return style.display !== 'none' && style.visibility !== 'hidden';
}

function scheduleFrame(callback: FrameRequestCallback) {
  if (window.requestAnimationFrame) return window.requestAnimationFrame(callback);
  return window.setTimeout(() => callback(performance.now()), 0);
}

function cancelFrame(handle: number) {
  if (window.cancelAnimationFrame) window.cancelAnimationFrame(handle);
  else window.clearTimeout(handle);
}

export interface DialogProps {
  children: ReactNode;
  title: string;
  onClose: () => void;
  panelClassName: string;
  overlayClassName?: string;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
  descriptionId?: string;
  role?: 'dialog' | 'alertdialog';
  panelAs?: ElementType;
}

export default function Dialog({
  children,
  title,
  onClose,
  panelClassName,
  overlayClassName = 'modal-overlay',
  closeOnBackdrop = true,
  closeOnEscape = true,
  initialFocusRef,
  descriptionId,
  role = 'dialog',
  panelAs: Panel = 'div',
}: DialogProps) {
  const reactId = useId();
  const titleId = `dialog-title-${reactId.replace(/:/g, '')}`;
  const instanceId = useRef(Symbol('accessible-overlay'));
  const panelRef = useRef<HTMLElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const closeOnEscapeRef = useRef(closeOnEscape);

  onCloseRef.current = onClose;
  closeOnEscapeRef.current = closeOnEscape;

  useEffect(() => {
    const id = instanceId.current;
    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    mountOverlay(id);

    const frame = scheduleFrame(() => {
      const panel = panelRef.current;
      const preferred = initialFocusRef?.current;
      const firstFocusable = panel?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      (preferred ?? firstFocusable ?? panel)?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isTopOverlay(id)) return;

      if (event.key === 'Escape' && closeOnEscapeRef.current) {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }

      if (event.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
        .filter(isVisible);

      if (focusable.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      cancelFrame(frame);
      document.removeEventListener('keydown', handleKeyDown, true);
      unmountOverlay(id);
      const previousFocus = previousFocusRef.current;
      scheduleFrame(() => {
        if (previousFocus?.isConnected) previousFocus.focus();
      });
    };
  }, [initialFocusRef]);

  const handleBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    if (closeOnBackdrop && event.target === event.currentTarget && isTopOverlay(instanceId.current)) {
      onClose();
    }
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className={overlayClassName} onClick={handleBackdropClick} data-accessible-overlay>
      <Panel
        ref={panelRef}
        className={panelClassName}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
      >
        <h2 id={titleId} className="sr-only">{title}</h2>
        {children}
      </Panel>
    </div>,
    getOverlayRoot(),
  );
}
