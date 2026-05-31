import { useState, useMemo } from 'react';
import { Search, X, ArrowUpDown, ArrowUp, ArrowDown, Copy, Check, Pencil, Loader2, Users } from 'lucide-react';
import type { WgPeer } from '../../../../types/api';
import { formatLastHandshake } from '../utils';

type SortKey = 'active' | 'name' | 'allowedAddress' | 'lastHandshakeSecs';
type SortDir = 'asc' | 'desc';
type StatusFilter = 'all' | 'active' | 'inactive';

interface UsersTableProps {
  peers: WgPeer[];
  peerColors: Record<string, string>;
  editingPeerId: string | null;
  editingPeerName: string;
  savingPeerName: boolean;
  copiedPeerId: string | null;
  onStartEdit: (peer: WgPeer) => void;
  onCancelEdit: () => void;
  onChangeEditName: (name: string) => void;
  onSavePeerName: (peer: WgPeer) => void;
  onCopyConfig: (peer: WgPeer) => void;
}

export default function UsersTable({
  peers,
  peerColors,
  editingPeerId,
  editingPeerName,
  savingPeerName,
  copiedPeerId,
  onStartEdit,
  onCancelEdit,
  onChangeEditName,
  onSavePeerName,
  onCopyConfig,
}: UsersTableProps) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('active');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let result = peers;
    if (status !== 'all') result = result.filter(p => (status === 'active' ? p.active : !p.active));
    if (q) result = result.filter(p =>
      p.name?.toLowerCase().includes(q) || p.allowedAddress?.toLowerCase().includes(q)
    );
    return [...result].sort((a, b) => {
      let va: number | string;
      let vb: number | string;
      switch (sortKey) {
        case 'active': va = a.active ? 1 : 0; vb = b.active ? 1 : 0; break;
        case 'lastHandshakeSecs': va = a.lastHandshakeSecs ?? Infinity; vb = b.lastHandshakeSecs ?? Infinity; break;
        case 'name': va = a.name?.toLowerCase() ?? ''; vb = b.name?.toLowerCase() ?? ''; break;
        default: va = a.allowedAddress ?? ''; vb = b.allowedAddress ?? '';
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [peers, search, status, sortKey, sortDir]);

  const activeCount = peers.filter(p => p.active).length;

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return <ArrowUpDown className="w-3 h-3 text-slate-300 ml-1 opacity-0 group-hover:opacity-100 transition-opacity" />;
    return sortDir === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-500 ml-1" /> : <ArrowDown className="w-3 h-3 text-indigo-500 ml-1" />;
  };

  const statusChips: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: 'Todos' },
    { key: 'active', label: 'Activos' },
    { key: 'inactive', label: 'Inactivos' },
  ];

  return (
    <div className="card overflow-hidden border border-slate-200">
      {/* Toolbar: búsqueda + filtros */}
      <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-50/50 to-white flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar usuario o IP…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-11 pr-10 py-3 text-sm rounded-xl border border-slate-200 bg-white
                       focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400
                       placeholder:text-slate-400 text-slate-700 transition-all"
          />
          {search && (
            <button onClick={() => setSearch('')} title="Limpiar búsqueda" aria-label="Limpiar búsqueda"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors p-1">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {statusChips.map(c => (
            <button key={c.key} onClick={() => setStatus(c.key)}
              className={`px-3 py-2 rounded-lg text-xs font-bold border transition-all
                ${status === c.key
                  ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                  : 'bg-white border-slate-200 text-slate-500 hover:border-indigo-200'}`}>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tabla */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 select-none">
              <th className="th-cell w-10" aria-label="Color" />
              <th className="th-cell cursor-pointer hover:bg-slate-100 group transition-colors" onClick={() => handleSort('active')}>
                <div className="flex items-center">Estado <SortIcon k="active" /></div>
              </th>
              <th className="th-cell cursor-pointer hover:bg-slate-100 group transition-colors" onClick={() => handleSort('name')}>
                <div className="flex items-center">Usuario <SortIcon k="name" /></div>
              </th>
              <th className="th-cell cursor-pointer hover:bg-slate-100 group transition-colors" onClick={() => handleSort('allowedAddress')}>
                <div className="flex items-center">IP <SortIcon k="allowedAddress" /></div>
              </th>
              <th className="th-cell">Protocolo</th>
              <th className="th-cell cursor-pointer hover:bg-slate-100 group transition-colors" onClick={() => handleSort('lastHandshakeSecs')}>
                <div className="flex items-center">Último acceso <SortIcon k="lastHandshakeSecs" /></div>
              </th>
              <th className="th-cell text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map(peer => {
              const color = peerColors[peer.allowedAddress];
              const isEditing = editingPeerId === peer.id;
              return (
                <tr key={peer.id} className="hover:bg-indigo-50/30 transition-colors group">
                  {/* Color */}
                  <td className="px-4 py-3 w-10">
                    <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: color || (peer.active ? '#10b981' : '#cbd5e1') }} />
                  </td>
                  {/* Estado */}
                  <td className="px-4 py-3">
                    {peer.active ? (
                      <span className="inline-flex items-center gap-1.5 text-2xs font-semibold text-slate-400 uppercase tracking-wide">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Activo
                      </span>
                    ) : (
                      <span className="badge badge-neutral">Inactivo</span>
                    )}
                  </td>
                  {/* Usuario (editable) */}
                  <td className="px-4 py-3 min-w-[160px]">
                    {isEditing ? (
                      <div className="flex items-center gap-1.5">
                        <input autoFocus value={editingPeerName} onChange={e => onChangeEditName(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') onSavePeerName(peer); if (e.key === 'Escape') onCancelEdit(); }}
                          className="flex-1 px-2 py-1 text-xs border border-indigo-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 font-semibold max-w-[160px]" />
                        <button onClick={() => onSavePeerName(peer)} disabled={savingPeerName} className="p-1 rounded text-emerald-600 hover:bg-emerald-50" aria-label="Guardar nombre">
                          {savingPeerName ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                        </button>
                        <button onClick={onCancelEdit} className="p-1 rounded text-slate-400 hover:bg-slate-100" aria-label="Cancelar">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 group/name">
                        <span className={`font-semibold text-xs ${peer.active ? 'text-slate-800' : 'text-slate-400'}`}>{peer.name}</span>
                        <button onClick={() => onStartEdit(peer)} aria-label="Editar nombre"
                          className="opacity-0 group-hover/name:opacity-100 p-0.5 rounded text-slate-400 hover:text-indigo-600 transition-opacity">
                          <Pencil className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    )}
                  </td>
                  {/* IP */}
                  <td className="px-4 py-3"><span className="data-cell">{peer.allowedAddress}</span></td>
                  {/* Protocolo */}
                  <td className="px-4 py-3"><span className="badge badge-accent">WG</span></td>
                  {/* Último acceso */}
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium ${peer.lastHandshakeSecs == null ? 'text-slate-300' : peer.active ? 'text-slate-600' : 'text-slate-400'}`}>
                      {formatLastHandshake(peer.lastHandshakeSecs)}
                    </span>
                  </td>
                  {/* Acciones */}
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end">
                      <button onClick={() => onCopyConfig(peer)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors
                          ${copiedPeerId === peer.id ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-50 text-slate-600 group-hover:bg-indigo-600 group-hover:text-white border border-slate-200 group-hover:border-indigo-600'}`}>
                        {copiedPeerId === peer.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedPeerId === peer.id ? '¡Copiado!' : 'Config WG'}</span>
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <Users className="w-8 h-8 text-slate-300" />
                    <p className="text-slate-400 font-semibold">Sin usuarios</p>
                    <p className="text-slate-400 text-xs">
                      {search || status !== 'all' ? 'Ningún usuario coincide con los filtros' : 'No hay administradores configurados'}
                    </p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Footer: totales */}
      {peers.length > 0 && (
        <div className="px-6 py-3 border-t border-slate-100 bg-slate-50 text-xs text-slate-500">
          <span className="font-bold text-slate-700">{peers.length}</span> usuario{peers.length !== 1 ? 's' : ''}
          {' · '}<span className="text-emerald-600 font-semibold">{activeCount} activo{activeCount !== 1 ? 's' : ''}</span>
          {' · '}<span className="text-slate-400 font-semibold">{peers.length - activeCount} inactivo{peers.length - activeCount !== 1 ? 's' : ''}</span>
        </div>
      )}
    </div>
  );
}
