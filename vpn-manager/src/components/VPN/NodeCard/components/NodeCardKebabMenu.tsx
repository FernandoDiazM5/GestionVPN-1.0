import { createPortal } from 'react-dom';
import { MoreVertical, KeyRound, Wrench, Pencil, FileCode, Tag, History, Trash2, Loader2 } from 'lucide-react';
import type { NodeInfo } from '../../../../types/api';

interface NodeCardKebabMenuProps {
  node: NodeInfo;
  showKebab: boolean;
  kebabCoords: { top?: number; bottom?: number; right: number };
  kebabRef: React.RefObject<HTMLDivElement | null>;
  dropdownRef: React.RefObject<HTMLDivElement | null>;
  logs: string[];
  isRepairing: boolean;
  isPending: boolean;
  onHandleKebabClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onToggleWgPeerForm: () => void;
  onHandleRepair: () => void;
  onOpenSshForm: () => void;
  onEdit?: () => void;
  onScript?: () => void;
  onTagClick?: () => void;
  onHistory?: () => void;
  onDelete?: () => void;
}

export function NodeCardKebabMenu({
  node,
  showKebab,
  kebabCoords,
  kebabRef,
  dropdownRef,
  logs,
  isRepairing,
  isPending,
  onHandleKebabClick,
  onToggleWgPeerForm,
  onHandleRepair,
  onOpenSshForm,
  onEdit,
  onScript,
  onTagClick,
  onHistory,
  onDelete,
}: NodeCardKebabMenuProps) {
  return (
    <div ref={kebabRef} className="relative">
      <button
        onClick={onHandleKebabClick}
        title="Más acciones"
        className={`relative p-1.5 rounded-lg transition-colors
          ${showKebab
            ? 'text-slate-700 bg-slate-100'
            : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'}`}
      >
        <MoreVertical className="w-4 h-4" />
        {logs.length > 0 && (
          <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-indigo-500 ring-1 ring-white" />
        )}
      </button>

      {showKebab && createPortal(
        <div
          ref={dropdownRef}
          style={kebabCoords}
          className="fixed w-52 bg-white border border-slate-200 rounded-xl shadow-lg shadow-slate-200/60 z-[9999] py-1 overflow-hidden dark:bg-slate-800 dark:border-slate-700 dark:shadow-black/40"
        >
          {/* WireGuard */}
          {node.service === 'wireguard' && !node.wg_public_key && (
            <button
              onClick={() => { onToggleWgPeerForm(); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-slate-600 hover:bg-violet-50 hover:text-violet-700 transition-colors text-left"
            >
              <KeyRound className="w-3.5 h-3.5 text-violet-500 shrink-0" />
              <span>Configurar peer WireGuard</span>
            </button>
          )}

          {/* Reparar */}
          {!!node.nombre_vrf && (
            <button
              onClick={() => { onHandleRepair(); }}
              disabled={isPending || isRepairing}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-slate-600 hover:bg-amber-50 hover:text-amber-700 transition-colors text-left disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isRepairing
                ? <Loader2 className="w-3.5 h-3.5 text-amber-500 shrink-0 animate-spin" />
                : <Wrench className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
              <span>{isRepairing ? 'Reparando...' : 'Verificar y reparar'}</span>
            </button>
          )}

          {/* SSH */}
          <button
            onClick={() => { onOpenSshForm(); }}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors text-left
              ${showKebab
                ? 'bg-amber-50 text-amber-700'
                : 'text-slate-600 hover:bg-amber-50 hover:text-amber-700'}`}
          >
            <KeyRound className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span>Credenciales SSH</span>
          </button>

          {/* Divisor */}
          <div className="my-1 border-t border-slate-100" />

          {/* Editar / Scripts / Tags / Historial */}
          <button
            onClick={() => { onEdit?.(); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-slate-600 hover:bg-indigo-50 hover:text-indigo-700 transition-colors text-left"
          >
            <Pencil className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <span>Editar nodo</span>
          </button>

          <button
            onClick={() => { onScript?.(); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-slate-600 hover:bg-emerald-50 hover:text-emerald-700 transition-colors text-left"
          >
            <FileCode className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            <span>Script de configuración</span>
          </button>

          <button
            onClick={() => { onTagClick?.(); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-slate-600 hover:bg-amber-50 hover:text-amber-700 transition-colors text-left"
          >
            <Tag className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>Gestionar etiquetas</span>
          </button>

          <button
            onClick={() => { onHistory?.(); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-slate-600 hover:bg-sky-50 hover:text-sky-700 transition-colors text-left"
          >
            <History className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            <span>Historial de conexión</span>
          </button>

          {/* Divisor + Eliminar */}
          <div className="my-1 border-t border-slate-100" />

          <button
            onClick={() => { onDelete?.(); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-rose-500 hover:bg-rose-50 hover:text-rose-700 transition-colors text-left"
          >
            <Trash2 className="w-3.5 h-3.5 shrink-0" />
            <span>Eliminar nodo</span>
          </button>

          {/* Logs activos */}
          {logs.length > 0 && (
            <>
              <div className="my-1 border-t border-slate-100" />
              <div className="flex items-center gap-2.5 px-3 py-2">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
                <span className="text-[10px] text-indigo-500 font-semibold">Logs activos ({logs.length})</span>
              </div>
            </>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
