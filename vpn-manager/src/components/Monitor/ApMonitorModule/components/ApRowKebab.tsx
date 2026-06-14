import { useState, useRef, useEffect, useCallback, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical } from 'lucide-react';

export interface KebabItem {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}

// Menú "⋮" de acciones secundarias para una fila de AP. Usa portal con
// position:fixed para no ser recortado por el overflow-x-auto de la tabla.
export function ApRowKebab({ items }: { items: KebabItem[] }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; right: number }>({ top: 0, right: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const place = useCallback(() => {
    const b = btnRef.current?.getBoundingClientRect();
    if (b) setCoords({ top: b.bottom + 4, right: Math.max(8, window.innerWidth - b.right) });
  }, []);

  useEffect(() => {
    if (!open) return;
    place();
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node) && !btnRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const onScroll = () => setOpen(false);
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open, place]);

  return (
    <>
      <button ref={btnRef} onClick={() => setOpen(o => !o)} title="Más acciones" aria-label="Más acciones"
        aria-haspopup="menu" aria-expanded={open}
        className={`p-1.5 rounded-lg transition-colors ${open
          ? 'text-slate-700 bg-slate-100 dark:text-slate-100 dark:bg-slate-800'
          : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:text-slate-500 dark:hover:text-slate-100 dark:hover:bg-slate-800'}`}>
        <MoreVertical className="w-3.5 h-3.5" />
      </button>

      {open && createPortal(
        <div ref={menuRef} role="menu"
          style={{ position: 'fixed', top: coords.top, right: coords.right }}
          className="w-48 bg-white border border-slate-200 rounded-xl shadow-lg shadow-slate-200/60 z-[9999] py-1 overflow-hidden dark:bg-slate-800 dark:border-slate-700 dark:shadow-black/40">
          {items.map((it, i) => (
            <div key={it.label}>
              {it.danger && i > 0 && <div className="my-1 border-t border-slate-100 dark:border-slate-700" />}
              <button role="menuitem" disabled={it.disabled}
                onClick={() => { setOpen(false); it.onClick(); }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs text-left transition-colors disabled:opacity-40 disabled:cursor-not-allowed
                  ${it.danger
                    ? 'text-rose-500 hover:bg-rose-50 hover:text-rose-700 dark:text-rose-400 dark:hover:bg-rose-500/10 dark:hover:text-rose-300'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-slate-100'}`}>
                <span className="shrink-0">{it.icon}</span>
                <span>{it.label}</span>
              </button>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}
