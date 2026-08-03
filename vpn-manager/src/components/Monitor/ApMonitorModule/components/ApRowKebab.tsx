import { type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical } from 'lucide-react';
import { useKebabMenu } from '../../../VPN/NodeCard/hooks/useKebabMenu';

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
  const {
    showKebab,
    setShowKebab,
    kebabCoords,
    kebabRef,
    dropdownRef,
    handleKebabClick,
  } = useKebabMenu();

  return (
    <div ref={kebabRef} className="contents">
      <button onClick={handleKebabClick} title="Más opciones" aria-label="Más opciones"
        aria-haspopup="menu" aria-expanded={showKebab}
        className={`flex min-h-11 min-w-11 items-center justify-center rounded-lg transition-colors ${showKebab
          ? 'text-slate-700 bg-slate-100 dark:text-slate-100 dark:bg-slate-800'
          : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:text-slate-500 dark:hover:text-slate-100 dark:hover:bg-slate-800'}`}>
        <MoreVertical className="w-3.5 h-3.5" />
      </button>

      {showKebab && createPortal(
        <div ref={dropdownRef} role="menu"
          style={{
            position: 'fixed',
            top: kebabCoords.top,
            bottom: kebabCoords.bottom,
            right: kebabCoords.right,
            maxHeight: kebabCoords.maxHeight,
          }}
          className="z-[60] w-48 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl shadow-slate-200/60 dark:border-slate-700 dark:bg-slate-800 dark:shadow-black/40">
          {items.map((it, i) => (
            <div key={it.label}>
              {it.danger && i > 0 && <div className="my-1 border-t border-slate-100 dark:border-slate-700" />}
              <button role="menuitem" disabled={it.disabled}
                onClick={() => { setShowKebab(false); it.onClick(); }}
                className={`flex min-h-11 w-full items-center gap-2.5 px-3 py-2 text-left text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40
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
    </div>
  );
}
