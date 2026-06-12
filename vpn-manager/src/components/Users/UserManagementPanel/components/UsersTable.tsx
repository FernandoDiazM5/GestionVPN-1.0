import { useState, useMemo, useEffect, useRef } from 'react';
import {
  Search, X, ArrowUpDown, ArrowUp, ArrowDown, Copy, Check, Pencil, Loader2,
  Users, SlidersHorizontal, Mail, Key, Tag, Plus,
} from 'lucide-react';
import type { WgPeer } from '../../../../types/api';
import { formatLastHandshake } from '../utils';

// ────────────────────────────────────────────────────────────────────
//  Definición de columnas
// ────────────────────────────────────────────────────────────────────

type ColId = 'status' | 'name' | 'alias' | 'email' | 'address' | 'protocol' | 'pubkey' | 'lastSeen';

interface ColumnDef {
  id: ColId;
  label: string;
  // Las requeridas no se pueden ocultar (forman el esqueleto de la fila).
  required?: boolean;
  // Las opt-in arrancan ocultas por defecto.
  defaultHidden?: boolean;
}

const COLUMNS: ColumnDef[] = [
  { id: 'status',   label: 'Estado',        required: true },
  { id: 'name',     label: 'Usuario',       required: true },
  { id: 'alias',    label: 'Alias' },
  { id: 'email',    label: 'Email' },
  { id: 'address',  label: 'IP' },
  { id: 'protocol', label: 'Protocolo' },
  { id: 'pubkey',   label: 'Clave pública', defaultHidden: true },
  { id: 'lastSeen', label: 'Último acceso' },
];

const LS_VISIBLE_COLS = 'vpn_users_visible_cols';

function loadVisibleCols(): Set<ColId> {
  // Default: todo lo no-defaultHidden.
  const defaults = new Set<ColId>(COLUMNS.filter(c => !c.defaultHidden).map(c => c.id));
  try {
    const raw = localStorage.getItem(LS_VISIBLE_COLS);
    if (!raw) return defaults;
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return defaults;
    const valid = new Set<ColId>(arr.filter((c): c is ColId => COLUMNS.some(col => col.id === c)));
    // Asegura que las required estén presentes (defensa ante storage corrupto).
    COLUMNS.forEach(c => { if (c.required) valid.add(c.id); });
    return valid;
  } catch {
    return defaults;
  }
}

type SortKey = 'active' | 'name' | 'alias' | 'email' | 'allowedAddress' | 'lastHandshakeSecs';
type SortDir = 'asc' | 'desc';
type StatusFilter = 'all' | 'active' | 'inactive';

interface UsersTableProps {
  peers: WgPeer[];
  loading?: boolean;
  peerColors: Record<string, string>;
  copiedPeerId: string | null;
  onCopyConfig: (peer: WgPeer) => void;
  /**
   * Guarda el alias humano del peer (anotación libre: "PC casa", "Celular",
   * etc.). El "Usuario" es el comment de MikroTik y queda inmutable desde UI.
   * Devuelve true si el server confirmó el guardado.
   */
  onSaveAlias: (peerAddress: string, alias: string) => Promise<boolean>;
}

export default function UsersTable({
  peers,
  loading = false,
  peerColors,
  copiedPeerId,
  onCopyConfig,
  onSaveAlias,
}: UsersTableProps) {
  // ── Edición inline del alias (estado local — no contamina props) ──
  const [editingAliasAddr, setEditingAliasAddr] = useState<string | null>(null);
  const [draftAlias, setDraftAlias] = useState('');
  const [savingAliasAddr, setSavingAliasAddr] = useState<string | null>(null);

  const startEditAlias = (peer: WgPeer) => {
    setEditingAliasAddr(peer.allowedAddress);
    setDraftAlias(peer.alias || '');
  };
  const cancelEditAlias = () => { setEditingAliasAddr(null); setDraftAlias(''); };
  const commitAlias = async (peer: WgPeer) => {
    if (savingAliasAddr) return;
    setSavingAliasAddr(peer.allowedAddress);
    const ok = await onSaveAlias(peer.allowedAddress, draftAlias);
    setSavingAliasAddr(null);
    if (ok) cancelEditAlias();
  };
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('active');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // ── Columnas visibles (persistido) ────────────────────────────
  const [visibleCols, setVisibleCols] = useState<Set<ColId>>(loadVisibleCols);
  const [showColPicker, setShowColPicker] = useState(false);
  const colPickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try { localStorage.setItem(LS_VISIBLE_COLS, JSON.stringify([...visibleCols])); }
    catch { /* quota / privacy mode — sin persistencia */ }
  }, [visibleCols]);

  // Cierra el dropdown al click fuera
  useEffect(() => {
    if (!showColPicker) return;
    const onClick = (e: MouseEvent) => {
      if (colPickerRef.current && !colPickerRef.current.contains(e.target as Node)) {
        setShowColPicker(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [showColPicker]);

  const toggleCol = (id: ColId) => {
    setVisibleCols(prev => {
      const next = new Set(prev);
      const def = COLUMNS.find(c => c.id === id);
      if (def?.required) return prev;       // no se puede ocultar
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ── Sort + filter ─────────────────────────────────────────────
  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let result = peers;
    if (status !== 'all') result = result.filter(p => (status === 'active' ? p.active : !p.active));
    if (q) result = result.filter(p =>
      p.name?.toLowerCase().includes(q) ||
      p.allowedAddress?.toLowerCase().includes(q) ||
      p.email?.toLowerCase().includes(q) ||
      p.alias?.toLowerCase().includes(q)
    );
    return [...result].sort((a, b) => {
      let va: number | string;
      let vb: number | string;
      switch (sortKey) {
        case 'active':            va = a.active ? 1 : 0;                       vb = b.active ? 1 : 0; break;
        case 'lastHandshakeSecs': va = a.lastHandshakeSecs ?? Infinity;        vb = b.lastHandshakeSecs ?? Infinity; break;
        case 'name':              va = a.name?.toLowerCase() ?? '';            vb = b.name?.toLowerCase() ?? ''; break;
        case 'alias':             va = a.alias?.toLowerCase() ?? '￿';      vb = b.alias?.toLowerCase() ?? '￿'; break;
        case 'email':             va = a.email?.toLowerCase() ?? '￿';     vb = b.email?.toLowerCase() ?? '￿'; break;
        default:                  va = a.allowedAddress ?? '';                 vb = b.allowedAddress ?? '';
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [peers, search, status, sortKey, sortDir]);

  const activeCount = peers.filter(p => p.active).length;

  // ── Helpers ───────────────────────────────────────────────────
  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return <ArrowUpDown className="w-3 h-3 text-slate-300 ml-1 opacity-0 group-hover:opacity-100 transition-opacity" />;
    return sortDir === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-500 ml-1" /> : <ArrowDown className="w-3 h-3 text-indigo-500 ml-1" />;
  };

  const statusChips: { key: StatusFilter; label: string }[] = [
    { key: 'all',      label: 'Todos' },
    { key: 'active',   label: 'Activos' },
    { key: 'inactive', label: 'Inactivos' },
  ];

  const isVisible = (id: ColId) => visibleCols.has(id);
  const visibleCount = COLUMNS.filter(c => visibleCols.has(c.id)).length;
  // +2 columnas estructurales (color + acciones) que no son toggleable.
  const totalCols = visibleCount + 2;

  return (
    <div className="card overflow-hidden border border-slate-200">
      {/* Toolbar: búsqueda + filtros + selector de columnas */}
      <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-50/50 to-white dark:border-slate-800 dark:from-slate-800/30 dark:to-slate-900 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar usuario, alias, email o IP…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-11 pr-10 py-3 text-sm rounded-xl border border-slate-200 bg-white
                       focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400
                       placeholder:text-slate-400 text-slate-700 transition-all
                       dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder:text-slate-500"
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
                  ? 'bg-indigo-50 border-indigo-300 text-indigo-700 dark:bg-indigo-500/15 dark:border-indigo-500/40 dark:text-indigo-300'
                  : 'bg-white border-slate-200 text-slate-500 hover:border-indigo-200 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400 dark:hover:border-indigo-500/40'}`}>
              {c.label}
            </button>
          ))}

          {/* Selector de columnas */}
          <div className="relative" ref={colPickerRef}>
            <button
              onClick={() => setShowColPicker(v => !v)}
              title="Columnas visibles"
              aria-label="Columnas visibles"
              aria-expanded={showColPicker}
              className={`px-3 py-2 rounded-lg text-xs font-bold border transition-all flex items-center gap-1.5
                ${showColPicker
                  ? 'bg-indigo-50 border-indigo-300 text-indigo-700 dark:bg-indigo-500/15 dark:border-indigo-500/40 dark:text-indigo-300'
                  : 'bg-white border-slate-200 text-slate-500 hover:border-indigo-200 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400 dark:hover:border-indigo-500/40'}`}>
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Columnas</span>
            </button>
            {showColPicker && (
              <div className="absolute right-0 top-full mt-2 w-56 z-30 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg shadow-slate-900/10 dark:shadow-black/40 overflow-hidden">
                <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-700 text-2xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Mostrar columnas
                </div>
                <ul className="py-1 max-h-72 overflow-y-auto">
                  {COLUMNS.map(c => {
                    const checked = visibleCols.has(c.id);
                    const disabled = !!c.required;
                    return (
                      <li key={c.id}>
                        <label className={`flex items-center gap-2.5 px-3 py-2 text-xs cursor-pointer transition-colors
                          ${disabled
                            ? 'text-slate-400 dark:text-slate-500 cursor-not-allowed'
                            : 'text-slate-600 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-slate-700/50'}`}>
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={disabled}
                            onChange={() => toggleCol(c.id)}
                            className="accent-indigo-600"
                          />
                          <span className="flex-1 font-semibold">{c.label}</span>
                          {disabled && <span className="text-2xs uppercase tracking-wider text-slate-400 dark:text-slate-500">fija</span>}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabla */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 select-none dark:border-slate-800 dark:bg-slate-800/50">
              <th className="th-cell w-10" aria-label="Color" />
              {isVisible('status') && (
                <th className="th-cell cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 group transition-colors" onClick={() => handleSort('active')}>
                  <div className="flex items-center">Estado <SortIcon k="active" /></div>
                </th>
              )}
              {isVisible('name') && (
                <th className="th-cell cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 group transition-colors" onClick={() => handleSort('name')}>
                  <div className="flex items-center">Usuario <SortIcon k="name" /></div>
                </th>
              )}
              {isVisible('alias') && (
                <th className="th-cell cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 group transition-colors" onClick={() => handleSort('alias')}>
                  <div className="flex items-center">Alias <SortIcon k="alias" /></div>
                </th>
              )}
              {isVisible('email') && (
                <th className="th-cell cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 group transition-colors" onClick={() => handleSort('email')}>
                  <div className="flex items-center">Email <SortIcon k="email" /></div>
                </th>
              )}
              {isVisible('address') && (
                <th className="th-cell cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 group transition-colors" onClick={() => handleSort('allowedAddress')}>
                  <div className="flex items-center">IP <SortIcon k="allowedAddress" /></div>
                </th>
              )}
              {isVisible('protocol') && (
                <th className="th-cell">Protocolo</th>
              )}
              {isVisible('pubkey') && (
                <th className="th-cell">Clave pública</th>
              )}
              {isVisible('lastSeen') && (
                <th className="th-cell cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 group transition-colors" onClick={() => handleSort('lastHandshakeSecs')}>
                  <div className="flex items-center">Último acceso <SortIcon k="lastHandshakeSecs" /></div>
                </th>
              )}
              <th className="th-cell text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {loading && peers.length === 0 && [...Array(4)].map((_, i) => (
              <tr key={`sk-${i}`}>
                <td className="px-4 py-3"><div className="skeleton w-2.5 h-2.5 rounded-full" /></td>
                {[...Array(visibleCount)].map((_, j) => (
                  <td key={j} className="px-4 py-3"><div className="skeleton h-3 w-24" /></td>
                ))}
                <td className="px-4 py-3"><div className="skeleton h-7 w-20 ml-auto" /></td>
              </tr>
            ))}
            {filtered.map(peer => {
              const color = peerColors[peer.allowedAddress];
              return (
                <tr key={peer.id} className="hover:bg-indigo-50/30 dark:hover:bg-indigo-500/10 transition-colors group">
                  {/* Color */}
                  <td className="px-4 py-3 w-10">
                    <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: color || (peer.active ? '#10b981' : '#cbd5e1') }} />
                  </td>

                  {/* Estado */}
                  {isVisible('status') && (
                    <td className="px-4 py-3">
                      {peer.active ? (
                        <span className="inline-flex items-center gap-2 text-2xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">
                          <span className="status-live w-1.5 h-1.5 rounded-full bg-emerald-500 text-emerald-500" /> Activo
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-2 badge badge-neutral">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-500" /> Inactivo
                        </span>
                      )}
                    </td>
                  )}

                  {/* Usuario (comment en MikroTik — inmutable desde la UI para preservar trazabilidad) */}
                  {isVisible('name') && (
                    <td className="px-4 py-3 min-w-[160px]">
                      <span
                        title="Identificador MikroTik (no editable). Usa el alias para anotar el equipo."
                        className={`font-semibold text-xs ${peer.active ? 'text-slate-800 dark:text-slate-100' : 'text-slate-400'}`}
                      >
                        {peer.name}
                      </span>
                    </td>
                  )}

                  {/* Alias (anotación libre del moderador — editable inline) */}
                  {isVisible('alias') && (
                    <td className="px-4 py-3 min-w-[160px]">
                      <AliasCell
                        peer={peer}
                        editing={editingAliasAddr === peer.allowedAddress}
                        draft={draftAlias}
                        saving={savingAliasAddr === peer.allowedAddress}
                        onStart={() => startEditAlias(peer)}
                        onCancel={cancelEditAlias}
                        onChange={setDraftAlias}
                        onCommit={() => commitAlias(peer)}
                      />
                    </td>
                  )}

                  {/* Email (con copy on click) */}
                  {isVisible('email') && (
                    <td className="px-4 py-3 min-w-[160px]">
                      {peer.email ? (
                        <CopyableCell
                          icon={<Mail className="w-3 h-3 text-slate-300" />}
                          text={peer.email}
                          title={`Copiar ${peer.email}`}
                          mono={false}
                        />
                      ) : (
                        <span className="text-slate-300 dark:text-slate-600">—</span>
                      )}
                    </td>
                  )}

                  {/* IP (con copy on click) */}
                  {isVisible('address') && (
                    <td className="px-4 py-3">
                      <CopyableCell text={peer.allowedAddress} title={`Copiar ${peer.allowedAddress}`} />
                    </td>
                  )}

                  {/* Protocolo */}
                  {isVisible('protocol') && (
                    <td className="px-4 py-3"><span className="badge badge-accent">WG</span></td>
                  )}

                  {/* Public key (truncado, con copy on click) */}
                  {isVisible('pubkey') && (
                    <td className="px-4 py-3 max-w-[180px]">
                      {peer.publicKey ? (
                        <CopyableCell
                          icon={<Key className="w-3 h-3 text-slate-300" />}
                          text={peer.publicKey}
                          displayText={truncatePubKey(peer.publicKey)}
                          title={`Copiar ${peer.publicKey}`}
                        />
                      ) : (
                        <span className="text-slate-300 dark:text-slate-600">—</span>
                      )}
                    </td>
                  )}

                  {/* Último acceso */}
                  {isVisible('lastSeen') && (
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium ${peer.lastHandshakeSecs == null ? 'text-slate-300' : peer.active ? 'text-slate-600' : 'text-slate-400'}`}>
                        {formatLastHandshake(peer.lastHandshakeSecs)}
                      </span>
                    </td>
                  )}

                  {/* Acciones */}
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end">
                      <button onClick={() => onCopyConfig(peer)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors
                          ${copiedPeerId === peer.id ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400' : 'bg-slate-50 text-slate-600 group-hover:bg-indigo-600 group-hover:text-white border border-slate-200 group-hover:border-indigo-600 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 dark:group-hover:bg-indigo-500 dark:group-hover:border-indigo-500'}`}>
                        {copiedPeerId === peer.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedPeerId === peer.id ? '¡Copiado!' : 'Config WG'}</span>
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={totalCols} className="px-4 py-12 text-center">
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

      {/* Footer: totales + columnas activas */}
      {peers.length > 0 && (
        <div className="px-6 py-3 border-t border-slate-100 bg-slate-50 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-400 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <span className="font-bold text-slate-700 dark:text-slate-200">{peers.length}</span> usuario{peers.length !== 1 ? 's' : ''}
            {' · '}<span className="text-emerald-600 font-semibold">{activeCount} activo{activeCount !== 1 ? 's' : ''}</span>
            {' · '}<span className="text-slate-400 font-semibold">{peers.length - activeCount} inactivo{peers.length - activeCount !== 1 ? 's' : ''}</span>
          </div>
          <div className="text-2xs text-slate-400 dark:text-slate-500">
            {visibleCount} de {COLUMNS.length} columnas visibles
          </div>
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
//  Subcomponentes
// ────────────────────────────────────────────────────────────────────

interface CopyableCellProps {
  text: string;
  displayText?: string;
  title?: string;
  icon?: React.ReactNode;
  /** `true` → fuente monoespaciada (default para IPs/keys). */
  mono?: boolean;
}

function CopyableCell({ text, displayText, title, icon, mono = true }: CopyableCellProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard bloqueado (http no-localhost) — sin feedback */ }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={title || `Copiar ${text}`}
      className={`inline-flex items-center gap-1.5 group/cell rounded-md px-1 -mx-1 py-0.5 transition-colors
        hover:bg-indigo-50 dark:hover:bg-indigo-500/10
        ${mono ? 'data-cell' : 'text-xs text-slate-600 dark:text-slate-300'}`}
    >
      {icon}
      <span className="truncate max-w-[220px]">{displayText || text}</span>
      {copied
        ? <Check className="w-3 h-3 text-emerald-500 shrink-0" />
        : <Copy className="w-3 h-3 text-slate-300 opacity-0 group-hover/cell:opacity-100 transition-opacity shrink-0" />
      }
    </button>
  );
}

function truncatePubKey(pk: string): string {
  if (pk.length <= 16) return pk;
  return `${pk.slice(0, 8)}…${pk.slice(-6)}`;
}

// ────────────────────────────────────────────────────────────────────
//  AliasCell — render + edición inline del alias humano del peer
// ────────────────────────────────────────────────────────────────────

interface AliasCellProps {
  peer: WgPeer;
  editing: boolean;
  draft: string;
  saving: boolean;
  onStart: () => void;
  onCancel: () => void;
  onChange: (v: string) => void;
  onCommit: () => void;
}

function AliasCell({ peer, editing, draft, saving, onStart, onCancel, onChange, onCommit }: AliasCellProps) {
  if (editing) {
    return (
      <div className="flex items-center gap-1.5">
        <input
          autoFocus
          value={draft}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') onCommit();
            if (e.key === 'Escape') onCancel();
          }}
          maxLength={120}
          placeholder="PC casa, Laptop gestión…"
          className="flex-1 px-2 py-1 text-xs border border-indigo-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 max-w-[160px] dark:bg-slate-800 dark:border-indigo-500/50 dark:text-slate-100"
        />
        <button
          onClick={onCommit}
          disabled={saving}
          aria-label="Guardar alias"
          className="p-1 rounded text-emerald-600 hover:bg-emerald-50 disabled:opacity-50 dark:hover:bg-emerald-500/10"
        >
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
        </button>
        <button
          onClick={onCancel}
          disabled={saving}
          aria-label="Cancelar"
          className="p-1 rounded text-slate-400 hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-slate-800"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    );
  }

  if (peer.alias) {
    return (
      <div className="flex items-center gap-1.5 group/alias">
        <Tag className="w-3 h-3 text-indigo-400 shrink-0" />
        <span className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate max-w-[180px]" title={peer.alias}>
          {peer.alias}
        </span>
        <button
          onClick={onStart}
          aria-label="Editar alias"
          className="opacity-0 group-hover/alias:opacity-100 p-0.5 rounded text-slate-400 hover:text-indigo-600 transition-opacity"
        >
          <Pencil className="w-2.5 h-2.5" />
        </button>
      </div>
    );
  }

  // Sin alias — botón sutil para agregarlo
  return (
    <button
      onClick={onStart}
      className="inline-flex items-center gap-1 text-2xs text-slate-400 hover:text-indigo-600 dark:text-slate-500 dark:hover:text-indigo-400 transition-colors"
    >
      <Plus className="w-3 h-3" />
      <span>Agregar alias</span>
    </button>
  );
}
