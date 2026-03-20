import { useState, useEffect, useRef } from 'react';
import { Play, ShieldOff, Wifi, WifiOff, Clock, Loader2, Radio, Pencil, Trash2, FileCode, History, Tag } from 'lucide-react';
import { useVpn, TUNNEL_TIMEOUT_MS } from '../context/VpnContext';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';
import type { NodeInfo, TunnelActivateResponse } from '../types/api';
import { API_BASE_URL } from '../config';

interface NodeCardProps {
  node: NodeInfo;
  rowIndex: number;
  onEdit?: () => void;
  onDelete?: () => void;
  onScript?: () => void;
  onRename?: (newName: string) => void;
  onHistory?: () => void;
  tags?: string[];
  onTagClick?: () => void;
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return '00:00';
  const totalSecs = Math.floor(ms / 1000);
  const m = Math.floor(totalSecs / 60);
  const s = totalSecs % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const TAG_COLORS: Record<string, string> = {};
const TAG_PALETTE = ['#6366f1','#10b981','#0ea5e9','#f59e0b','#f43f5e','#8b5cf6','#f97316','#14b8a6','#ec4899','#64748b'];
function tagColor(tag: string) {
  if (!TAG_COLORS[tag]) {
    const idx = tag.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % TAG_PALETTE.length;
    TAG_COLORS[tag] = TAG_PALETTE[idx];
  }
  return TAG_COLORS[tag];
}

export default function NodeCard({ node, rowIndex, onEdit, onDelete, onScript, onRename, onHistory, tags = [], onTagClick }: NodeCardProps) {
  const {
    credentials,
    activeNodeVrf,
    setActiveNodeVrf,
    tunnelExpiry,
    setTunnelExpiry,
    adminIP,
    deactivateAllNodes,
  } = useVpn();

  const [isActivating, setIsActivating] = useState(false);
  const [isDeactivating, setIsDeactivating] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [countdown, setCountdown] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [savingName, setSavingName] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const isThisNodeActive = activeNodeVrf === node.nombre_vrf && !!node.nombre_vrf;
  const isAnyNodeActive = !!activeNodeVrf;

  // Countdown timer
  useEffect(() => {
    if (!isThisNodeActive || !tunnelExpiry) { setCountdown(''); return; }
    const tick = () => {
      const remaining = tunnelExpiry - Date.now();
      setCountdown(remaining > 0 ? formatCountdown(remaining) : '00:00');
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [isThisNodeActive, tunnelExpiry]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const addLog = (msg: string) => setLogs(prev => [...prev.slice(-8), msg]);

  useEffect(() => {
    if (editingName) nameInputRef.current?.focus();
  }, [editingName]);

  const startEditName = () => {
    setNameInput(node.nombre_nodo || '');
    setEditingName(true);
  };

  const cancelEditName = () => setEditingName(false);

  const saveNodeName = async () => {
    if (!nameInput.trim() || nameInput.trim() === node.nombre_nodo || savingName) return;
    const newName = nameInput.trim();
    const originalName = node.nombre_nodo;
    // Actualización optimista: cerrar input y mostrar nuevo nombre inmediatamente
    onRename?.(newName);
    setEditingName(false);
    setSavingName(true);
    try {
      const r = await fetchWithTimeout(`${API_BASE_URL}/api/node/label/save`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pppUser: node.ppp_user, label: newName }),
      }, 5_000);
      const d = await r.json();
      if (!d.success) onRename?.(originalName);
    } catch (_) {
      onRename?.(originalName);
    }
    setSavingName(false);
  };

  const handleActivate = async () => {
    if (!credentials || !node.nombre_vrf) return;
    setIsActivating(true);
    setLogs([]);
    try {
      if (isAnyNodeActive) {
        addLog('Revocando acceso anterior...');
        await deactivateAllNodes();
      }
      addLog(`Configurando VRF: ${node.nombre_vrf}`);
      addLog(`IP Admin: ${adminIP}`);
      const res = await fetchWithTimeout(`${API_BASE_URL}/api/tunnel/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ip: credentials.ip,
          user: credentials.user,
          pass: credentials.pass,
          tunnelIP: adminIP,
          targetVRF: node.nombre_vrf,
        }),
      }, 20_000);
      const data: TunnelActivateResponse = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message ?? 'Error activando tunnel');
      addLog(`✓ Acceso abierto a ${node.nombre_vrf}`);
      addLog(`Red remota: ${node.segmento_lan || 'N/A'}`);
      setActiveNodeVrf(node.nombre_vrf);
      setTunnelExpiry(Date.now() + TUNNEL_TIMEOUT_MS);
    } catch (err: unknown) {
      addLog(`✗ Error: ${err instanceof Error ? err.message : 'Error desconocido'}`);
    } finally {
      setIsActivating(false);
    }
  };

  const handleDeactivate = async () => {
    setIsDeactivating(true);
    addLog('Revocando acceso...');
    try {
      await deactivateAllNodes();
      addLog('✓ Acceso revocado correctamente');
    } catch (err: unknown) {
      addLog(`✗ Error: ${err instanceof Error ? err.message : 'Error desconocido'}`);
    } finally {
      setIsDeactivating(false);
    }
  };

  const isPending = isActivating || isDeactivating;
  const canActivate = !isPending && !!node.nombre_vrf && !node.disabled && node.running;
  const accessBlockReason = !node.nombre_vrf
    ? 'Sin VRF asignado'
    : node.disabled
      ? 'Secret PPP deshabilitado'
      : !node.running
        ? 'Torre no conectada al VPN'
        : null;

  const showLogs = logs.length > 0 || isPending;

  // Colores de fila
  const rowBg = isThisNodeActive
    ? 'bg-emerald-50/60'
    : isPending
      ? 'bg-indigo-50/60'
      : rowIndex % 2 === 0
        ? 'bg-white'
        : 'bg-slate-50/40';

  const borderLeft = isThisNodeActive
    ? 'border-l-2 border-l-emerald-400'
    : isPending
      ? 'border-l-2 border-l-indigo-400'
      : 'border-l-2 border-l-transparent';

  return (
    <>
      {/* ── Fila principal ── */}
      <tr className={`${rowBg} ${borderLeft} transition-colors hover:bg-indigo-50/30 group`}>

        {/* Estado */}
        <td className="px-4 py-3 w-10">
          <div
            className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0
              ${isThisNodeActive
                ? 'bg-emerald-500 shadow-sm shadow-emerald-500/40'
                : isPending
                  ? 'bg-indigo-500 shadow-sm shadow-indigo-500/40'
                  : node.running
                    ? 'bg-sky-500 shadow-sm shadow-sky-500/30'
                    : 'bg-slate-200'}`}
          >
            {isThisNodeActive ? (
              <Radio className="w-3.5 h-3.5 text-white animate-pulse" />
            ) : isPending ? (
              <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />
            ) : node.running ? (
              <Wifi className="w-3.5 h-3.5 text-white" />
            ) : (
              <WifiOff className="w-3.5 h-3.5 text-slate-400" />
            )}
          </div>
        </td>

        {/* Nombre del nodo */}
        <td className="px-4 py-3 min-w-[160px]">
          <div className="space-y-1">
            {editingName ? (
              <div className="flex items-center gap-1.5">
                <input
                  ref={nameInputRef}
                  value={nameInput}
                  onChange={e => setNameInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') saveNodeName(); if (e.key === 'Escape') cancelEditName(); }}
                  className="flex-1 px-2 py-1 text-xs border border-indigo-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 font-semibold min-w-0 max-w-[150px]"
                />
                <button onClick={saveNodeName} disabled={savingName || !nameInput.trim() || nameInput.trim() === node.nombre_nodo}
                  className="p-1 rounded text-emerald-600 hover:bg-emerald-50 disabled:opacity-40">
                  {savingName ? <Loader2 className="w-3 h-3 animate-spin" /> : <span className="text-[11px] font-bold">✓</span>}
                </button>
                <button onClick={cancelEditName} className="p-1 rounded text-slate-400 hover:bg-slate-100">
                  <span className="text-[11px] font-bold">✕</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 group/name">
                <p className="font-semibold text-slate-800 text-xs leading-tight truncate max-w-[180px]" title={node.nombre_nodo}>
                  {node.nombre_nodo}
                </p>
                <button onClick={startEditName} title="Editar nombre"
                  className="opacity-0 group-hover/name:opacity-100 p-0.5 rounded text-slate-400 hover:text-indigo-600 transition-opacity shrink-0">
                  <Pencil className="w-2.5 h-2.5" />
                </button>
              </div>
            )}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span
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
            {/* Tags */}
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

        {/* VRF */}
        <td className="px-4 py-3">
          <span
            className={`font-mono text-xs font-semibold truncate block max-w-[140px]
              ${node.nombre_vrf ? 'text-indigo-600' : 'text-slate-300'}`}
            title={node.nombre_vrf}
          >
            {node.nombre_vrf || '— Sin VRF'}
          </span>
        </td>

        {/* Red LAN */}
        <td className="px-4 py-3">
          {node.lan_subnets && node.lan_subnets.length > 1 ? (
            <div className="flex flex-col gap-0.5">
              {node.lan_subnets.map(s => (
                <span key={s} className="font-mono text-xs font-semibold text-sky-600">{s}</span>
              ))}
            </div>
          ) : (
            <span className={`font-mono text-xs font-semibold ${node.segmento_lan ? 'text-sky-600' : 'text-slate-300'}`}>
              {node.segmento_lan || '—'}
            </span>
          )}
        </td>

        {/* IP Túnel */}
        <td className="px-4 py-3">
          <span className={`font-mono text-xs font-semibold ${node.ip_tunnel ? 'text-emerald-600' : 'text-slate-300'}`}>
            {node.ip_tunnel || '—'}
          </span>
        </td>

        {/* Usuario PPP */}
        <td className="px-4 py-3">
          <span className="font-mono text-xs text-slate-500 truncate block max-w-[140px]" title={node.ppp_user}>
            {node.ppp_user}
          </span>
        </td>

        {/* Acciones */}
        <td className="px-4 py-3">
          <div className="flex items-center justify-end gap-2">
            {/* Razón de bloqueo como tooltip en el botón */}
            <button
              disabled={!canActivate || isThisNodeActive}
              onClick={handleActivate}
              title={accessBlockReason ?? undefined}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all
                ${canActivate && !isThisNodeActive
                  ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm shadow-indigo-500/25 active:scale-[0.97]'
                  : 'bg-slate-100 text-slate-300 cursor-not-allowed'}`}
            >
              {isActivating
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Play className="w-3.5 h-3.5" />}
              <span>{isActivating ? 'Abriendo...' : 'Acceder'}</span>
            </button>

            <button
              disabled={!isThisNodeActive || isPending}
              onClick={handleDeactivate}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all
                ${isThisNodeActive && !isPending
                  ? 'bg-rose-500 hover:bg-rose-600 text-white shadow-sm shadow-rose-500/25 active:scale-[0.97]'
                  : 'bg-slate-100 text-slate-300 cursor-not-allowed'}`}
            >
              {isDeactivating
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <ShieldOff className="w-3.5 h-3.5" />}
              <span>{isDeactivating ? 'Revocando...' : 'Revocar'}</span>
            </button>

            {/* Separator */}
            <div className="w-px h-5 bg-slate-200" />

            <button
              onClick={onEdit}
              title="Editar nodo"
              className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onDelete}
              title="Eliminar nodo"
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onScript}
              title="Copiar script de configuración para el equipo remoto"
              className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
            >
              <FileCode className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onTagClick}
              title="Gestionar etiquetas"
              className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
            >
              <Tag className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onHistory}
              title="Historial de conexión"
              className="p-1.5 rounded-lg text-slate-400 hover:text-sky-600 hover:bg-sky-50 transition-colors"
            >
              <History className="w-3.5 h-3.5" />
            </button>
          </div>
        </td>
      </tr>

      {/* ── Fila expandida: terminal de logs ── */}
      {showLogs && (
        <tr className={rowBg}>
          <td colSpan={7} className="px-4 pb-3 pt-0">
            <div className="ml-10 bg-slate-900 rounded-xl px-4 py-3 max-h-[80px] overflow-y-auto">
              <div className="console-text text-emerald-400 space-y-0.5 text-[11px]">
                {logs.map((log, i) => (
                  <div key={i} className={i === logs.length - 1 ? 'text-white' : 'text-slate-500'}>
                    › {log}
                  </div>
                ))}
                <div ref={logsEndRef} />
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
