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
              className="flex-1 px-2 py-1 text-xs border border-indigo-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 font-semibold min-w-0 max-w-[150px]"
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
              ? <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 border border-violet-200 leading-none shrink-0" title="WireGuard">WG</span>
              : <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 border border-sky-200 leading-none shrink-0" title="SSTP">SSTP</span>
            }
            <p className="font-semibold text-slate-800 text-xs flex-1 leading-tight truncate max-w-[150px]" title={node.nombre_nodo}>
              {node.nombre_nodo}
            </p>
            <button onClick={onStartEdit} title="Editar nombre"
              className="opacity-0 group-hover/name:opacity-100 p-0.5 rounded text-slate-400 hover:text-indigo-600 transition-opacity shrink-0">
              <Pencil className="w-2.5 h-2.5" />
            </button>
          </div>
        )}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span
            title={
              !node.running && !node.disabled && node.service === 'wireguard'
                ? 'Sin handshake WireGuard reciente'
                : !node.running && !node.disabled
                  ? 'Torre no conectada al VPN'
                  : undefined
            }
            className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-md leading-none
              ${node.running && !node.disabled
                ? 'bg-emerald-100 text-emerald-700'
                : node.disabled
                  ? 'bg-rose-100 text-rose-600'
                  : 'bg-slate-100 text-slate-500'}`}
          >
            {node.disabled ? 'Deshabilitado' : node.running ? 'Conectado' : 'Desconectado'}
          </span>
          {isThisNodeActive && countdown && (
            <span className="text-[10px] font-bold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-md flex items-center gap-1 leading-none">
              <Clock className="w-2.5 h-2.5" />
              {countdown}
            </span>
          )}
        </div>
        {tags.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap mt-0.5">
            {tags.map(t => (
              <span key={t} className="text-[9px] font-bold px-1.5 py-0.5 rounded-full text-white leading-none"
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
