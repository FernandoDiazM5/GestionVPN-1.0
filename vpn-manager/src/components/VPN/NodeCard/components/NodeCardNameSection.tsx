import { Pencil, Clock, Loader2 } from 'lucide-react';
import { tagColor } from '../utils';
import type { NodeInfo } from '../../../../types/api';

interface NodeCardNameSectionProps {
  node: NodeInfo;
  editingName: boolean;
  nameInput: string;
  savingName: boolean;
  nameInputRef: React.RefObject<HTMLInputElement | null>;
  countdown: string;
  isThisNodeActive: boolean;
  tags: string[];
  onSetNameInput: (value: string) => void;
  onSaveName: () => void;
  onCancelEdit: () => void;
  onStartEdit: () => void;
  /** Permite renombrar inline (lápiz). Falso para MEMBER. */
  canEditName?: boolean;
}

export function NodeCardNameSection({
  node,
  editingName,
  nameInput,
  savingName,
  nameInputRef,
  countdown,
  isThisNodeActive,
  tags,
  onSetNameInput,
  onSaveName,
  onCancelEdit,
  onStartEdit,
  canEditName = true,
}: NodeCardNameSectionProps) {
  return (
    <td className="px-4 py-3 min-w-[160px]">
      <div className="space-y-1">
        {editingName ? (
          <div className="flex items-center gap-1.5">
            <input
              ref={nameInputRef}
              value={nameInput}
              onChange={e => onSetNameInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') onSaveName(); if (e.key === 'Escape') onCancelEdit(); }}
              className="flex-1 px-2 py-1 text-xs border border-indigo-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 font-semibold min-w-0 max-w-[150px] dark:bg-slate-800 dark:border-indigo-500/50 dark:text-slate-100"
            />
            <button onClick={onSaveName} disabled={savingName || !nameInput.trim() || nameInput.trim() === node.nombre_nodo}
              className="p-1 rounded text-emerald-600 hover:bg-emerald-50 disabled:opacity-40">
              {savingName ? <Loader2 className="w-3 h-3 animate-spin" /> : <span className="text-[11px] font-bold">✓</span>}
            </button>
            <button onClick={onCancelEdit} className="p-1 rounded text-slate-400 hover:bg-slate-100">
              <span className="text-[11px] font-bold">✕</span>
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 group/name">
            {node.service === 'wireguard'
              ? <span className="badge badge-accent shrink-0" title="WireGuard">WG</span>
              : <span className="badge badge-info shrink-0" title="SSTP">SSTP</span>
            }
            <p className="font-semibold text-slate-800 dark:text-slate-100 text-xs flex-1 leading-tight truncate max-w-[200px]" title={node.nombre_nodo}>
              {node.nombre_nodo}
            </p>
            {canEditName && (
              <button onClick={onStartEdit} title="Editar nombre"
                className="opacity-0 group-hover/name:opacity-100 p-0.5 rounded text-slate-400 hover:text-indigo-600 transition-opacity shrink-0">
                <Pencil className="w-2.5 h-2.5" />
              </button>
            )}
          </div>
        )}
        <div className="flex items-center gap-1.5 flex-wrap">
          {node.running && !node.disabled ? (
            /* Estado normal → discreto (la señal verde ya está en el ícono) */
            <span className="inline-flex items-center gap-1 text-2xs font-semibold text-slate-400 uppercase tracking-wide">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Conectado
            </span>
          ) : (
            /* Excepción → badge prominente */
            <span
              title={
                !node.running && !node.disabled && node.service === 'wireguard'
                  ? 'Sin handshake WireGuard reciente'
                  : !node.running && !node.disabled
                    ? 'Torre no conectada al VPN'
                    : undefined
              }
              className={`badge ${node.disabled ? 'badge-danger' : 'badge-warning'}`}
            >
              {node.disabled ? 'Deshabilitado' : 'Desconectado'}
            </span>
          )}
          {isThisNodeActive && countdown && (
            <span className="badge badge-warning">
              <Clock className="w-2.5 h-2.5" />
              {countdown}
            </span>
          )}
          {/* Visibilidad admin: túnel activo por OTRO usuario (multi-usuario) */}
          {node.active_by_other && !isThisNodeActive && (
            <span className="badge badge-info" title={`En uso por ${node.active_by_other}`}>
              {node.active_by_other}
            </span>
          )}
        </div>
        {tags.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap mt-0.5">
            {tags.map(t => (
              <span key={t} className="text-2xs font-bold px-1.5 py-0.5 rounded-full text-white leading-none"
                style={{ backgroundColor: tagColor(t) }}>
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
    </td>
  );
}
