import { createPortal } from 'react-dom';
import { MoreVertical, KeyRound, Wrench, Pencil, FileCode, Tag, History, Trash2, Loader2, Network } from 'lucide-react';
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
  onDiagnose?: () => void;
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
  onDiagnose,
}: NodeCardKebabMenuProps) {
  return (
    <div ref={kebabRef} className="relative">
      <button
        onClick={onHandleKebabClick}
        title="Más acciones"
        className={`relative p-1.5 rounded-lg transition-colors
          ${showKebab
            ? 'text-slate-700 bg-slate-100 dark:text-slate-100 dark:bg-slate-800'
            : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:text-slate-500 dark:hover:text-slate-100 dark:hover:bg-slate-800'}`}
      >
        <MoreVertical className="w-4 h-4" />
        {logs.length > 0 && (
          <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-indigo-500 ring-1 ring-white dark:ring-slate-900" />
        )}
      </button>

      {showKebab && createPortal(
        <div
          ref={dropdownRef}
          style={kebabCoords}
          className="fixed w-52 bg-white border border-slate-200 rounded-xl shadow-lg shadow-slate-200/60 z-[9999] py-1 overflow-hidden dark:bg-slate-800 dark:border-slate-700 dark:shadow-black/40"
        >
          {/* ── Sección: Configuración del nodo ──
              Color = intención (sistema de diseño): los ítems son acciones
              neutras (slate) salvo dos con semántica propia — violeta = peer
              WireGuard (protocolo), ámbar = recuperación/atención (reparar). */}
          <p className="px-3 pt-2 pb-1 text-3xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Configuración</p>

          {node.service === 'wireguard' && !node.wg_public_key && (
            <button
              onClick={() => { onToggleWgPeerForm(); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-slate-600 hover:bg-violet-50 hover:text-violet-700 transition-colors text-left dark:text-slate-300 dark:hover:bg-violet-500/10 dark:hover:text-violet-400"
            >
              <KeyRound className="w-3.5 h-3.5 text-violet-500 shrink-0" />
              <span>Configurar peer WireGuard</span>
            </button>
          )}

          {!!node.nombre_vrf && (
            <button
              onClick={() => { onHandleRepair(); }}
              disabled={isPending || isRepairing}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-slate-600 hover:bg-amber-50 hover:text-amber-700 transition-colors text-left disabled:opacity-40 disabled:cursor-not-allowed dark:text-slate-300 dark:hover:bg-amber-500/10 dark:hover:text-amber-400"
            >
              {isRepairing
                ? <Loader2 className="w-3.5 h-3.5 text-amber-500 shrink-0 animate-spin" />
                : <Wrench className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
              <span>{isRepairing ? 'Reparando...' : 'Verificar y reparar'}</span>
            </button>
          )}

          <button
            onClick={() => { onEdit?.(); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-slate-600 hover:bg-slate-100 hover:text-slate-800 transition-colors text-left dark:text-slate-300 dark:hover:bg-slate-700/60 dark:hover:text-slate-100"
          >
            <Pencil className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span>Editar nodo</span>
          </button>

          <button
            onClick={() => { onOpenSshForm(); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-slate-600 hover:bg-slate-100 hover:text-slate-800 transition-colors text-left dark:text-slate-300 dark:hover:bg-slate-700/60 dark:hover:text-slate-100"
          >
            <KeyRound className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span>Credenciales SSH</span>
          </button>

          {/* ── Sección: Información y herramientas (solo lectura) ── */}
          <div className="my-1 border-t border-slate-100 dark:border-slate-700" />
          <p className="px-3 pt-1 pb-1 text-3xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Información</p>

          <button
            onClick={() => { onScript?.(); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-slate-600 hover:bg-slate-100 hover:text-slate-800 transition-colors text-left dark:text-slate-300 dark:hover:bg-slate-700/60 dark:hover:text-slate-100"
          >
            <FileCode className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span>Script de configuración</span>
          </button>

          <button
            onClick={() => { onHistory?.(); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-slate-600 hover:bg-slate-100 hover:text-slate-800 transition-colors text-left dark:text-slate-300 dark:hover:bg-slate-700/60 dark:hover:text-slate-100"
          >
            <History className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span>Historial de conexión</span>
          </button>

          <button
            onClick={() => { onDiagnose?.(); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-slate-600 hover:bg-slate-100 hover:text-slate-800 transition-colors text-left dark:text-slate-300 dark:hover:bg-slate-700/60 dark:hover:text-slate-100"
          >
            <Network className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span>Diagnosticar (ping/trace)</span>
          </button>

          <button
            onClick={() => { onTagClick?.(); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-slate-600 hover:bg-slate-100 hover:text-slate-800 transition-colors text-left dark:text-slate-300 dark:hover:bg-slate-700/60 dark:hover:text-slate-100"
          >
            <Tag className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span>Gestionar etiquetas</span>
          </button>

          {/* ── Zona de peligro ── */}
          <div className="my-1 border-t border-slate-100 dark:border-slate-700" />

          <button
            onClick={() => { onDelete?.(); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-rose-500 hover:bg-rose-50 hover:text-rose-700 transition-colors text-left dark:text-rose-400 dark:hover:bg-rose-500/10 dark:hover:text-rose-300"
          >
            <Trash2 className="w-3.5 h-3.5 shrink-0" />
            <span>Eliminar nodo</span>
          </button>

          {/* Logs activos */}
          {logs.length > 0 && (
            <>
              <div className="my-1 border-t border-slate-100 dark:border-slate-700" />
              <div className="flex items-center gap-2.5 px-3 py-2">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
                <span className="text-2xs text-indigo-500 font-semibold dark:text-indigo-400">Logs activos ({logs.length})</span>
              </div>
            </>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
