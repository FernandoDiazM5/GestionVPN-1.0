import { useState, useEffect, useRef, Fragment } from 'react';
import { createPortal } from 'react-dom';
import { apiFetch } from '../utils/apiClient';
import { Play, ShieldOff, Wifi, WifiOff, Clock, Loader2, Radio, Pencil, Trash2, FileCode, History, Tag, KeyRound, Check, X, PlusCircle, Eye, EyeOff, Wrench, MoreVertical } from 'lucide-react';
import { useVpn, TUNNEL_TIMEOUT_MS } from '../context/VpnContext';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';
import type { NodeInfo, TunnelActivateResponse, MangleAccessResponse } from '../types/api';
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
  const [showSshForm, setShowSshForm] = useState(false);
  const [sshCredsArr, setSshCredsArr] = useState<Array<{ user: string; pass: string }>>([{ user: '', pass: '' }]);
  const [sshLoading, setSshLoading] = useState(false);
  const [sshSaved, setSshSaved] = useState(false);
  const [showPasswords, setShowPasswords] = useState(false);
  const [isRepairing, setIsRepairing] = useState(false);
  const [showWgPeerForm, setShowWgPeerForm] = useState(false);
  const [wgPeerKey, setWgPeerKey] = useState('');
  const [isSettingPeer, setIsSettingPeer] = useState(false);
  const [showKebab, setShowKebab] = useState(false);
  const [kebabCoords, setKebabCoords] = useState<{ top?: number, bottom?: number, right: number }>({ top: 0, right: 0 });
  const logsEndRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const kebabRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

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

  // Limpiar logs cuando este nodo pierde el túnel activo (otro nodo lo tomó o fue revocado externamente)
  const prevActiveRef = useRef(isThisNodeActive);
  useEffect(() => {
    if (prevActiveRef.current && !isThisNodeActive && !isDeactivating) {
      setTimeout(() => setLogs([]), 800);
    }
    prevActiveRef.current = isThisNodeActive;
  }, [isThisNodeActive, isDeactivating]);

  const addLog = (msg: string) => setLogs(prev => [...prev.slice(-8), msg]);

  useEffect(() => {
    if (editingName) nameInputRef.current?.focus();
  }, [editingName]);

  // Cerrar kebab al hacer click fuera del dropdown o hacer scroll
  useEffect(() => {
    if (!showKebab) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        kebabRef.current && !kebabRef.current.contains(target) &&
        (!dropdownRef.current || !dropdownRef.current.contains(target))
      ) {
        setShowKebab(false);
      }
    };
    const scrollHandler = () => setShowKebab(false);
    
    document.addEventListener('mousedown', handler);
    window.addEventListener('scroll', scrollHandler, true);
    return () => {
      document.removeEventListener('mousedown', handler);
      window.removeEventListener('scroll', scrollHandler, true);
    };
  }, [showKebab]);

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
      if (!adminIP) throw new Error('IP Admin no configurada — revisa la sección de WireGuard');
      if (!node.nombre_vrf) throw new Error('Este nodo no tiene VRF asignado');
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
      let data: TunnelActivateResponse;
      try { data = await res.json(); } catch { throw new Error(`Error del servidor (HTTP ${res.status})`); }
      if (!res.ok || !data.success) throw new Error(data.message ?? `Error HTTP ${res.status}`);
      addLog(`✓ Acceso abierto a ${node.nombre_vrf}`);
      addLog(`Red remota: ${node.segmento_lan || 'N/A'}`);

      // ── Reglas ACCESO-DINAMICO: VPS + Operador ────────────────────────────
      addLog('Aplicando reglas de acceso dinámico...');
      try {
        const mangleRes = await fetchWithTimeout(`${API_BASE_URL}/api/tunnel/mangle-access`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vrfSeleccionado: node.nombre_vrf, ipCliente: adminIP }),
        }, 15_000);
        const mangleData: MangleAccessResponse = await mangleRes.json().catch(() => ({ success: false }));
        if (mangleData.success) {
          addLog(`✓ Mangle VPS: ${mangleData.ipVps} → ${mangleData.vrf}`);
          addLog(`✓ Mangle Operador: ${mangleData.ipCliente} → ${mangleData.vrf}`);
        } else {
          addLog(`⚠ Mangle-access: ${mangleData.message ?? 'Sin respuesta'}`);
        }
      } catch (mangleErr: unknown) {
        // No bloquear el flujo principal si falla la regla dinámica
        addLog(`⚠ Mangle dinámico: ${mangleErr instanceof Error ? mangleErr.message : 'Error'}`);
      }
      setActiveNodeVrf(node.nombre_vrf);
      setTunnelExpiry(Date.now() + TUNNEL_TIMEOUT_MS);
      apiFetch(`${API_BASE_URL}/api/node/history/add`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pppUser: node.ppp_user, event: 'tunnel_activated' }),
      }).catch(() => {});
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
      apiFetch(`${API_BASE_URL}/api/node/history/add`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pppUser: node.ppp_user, event: 'tunnel_deactivated' }),
      }).catch(() => {});
      setTimeout(() => setLogs([]), 1500);
    } catch (err: unknown) {
      addLog(`✗ Error: ${err instanceof Error ? err.message : 'Error desconocido'}`);
    } finally {
      setIsDeactivating(false);
    }
  };

  const handleRepair = async () => {
    if (!credentials || !node.nombre_vrf) return;
    setIsRepairing(true);
    setLogs([]);
    addLog('Verificando configuración MikroTik...');
    try {
      const res = await fetchWithTimeout(`${API_BASE_URL}/api/tunnel/repair`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pppUser: node.ppp_user,
          vrfName: node.nombre_vrf,
          lanSubnets: node.lan_subnets || [],
          tunnelIP: isThisNodeActive ? adminIP : null,
          adminWgNet: '192.168.21.0/24',
        }),
      }, 30_000);
      const data = await res.json() as { success?: boolean; message?: string; steps?: Array<{ obj: string; action?: string; status?: string }>; repaired?: number };
      if (!res.ok || !data.success) throw new Error(data.message ?? `Error HTTP ${res.status}`);
      for (const step of (data.steps || [])) {
        const icon = step.action === 'created' ? '+ ' : step.status === 'error' ? '✗ ' : '✓ ';
        addLog(`${icon}${step.obj}: ${step.action ?? step.status}`);
      }
      const repaired = data.repaired ?? 0;
      addLog(repaired > 0 ? `✓ Reparación completa (${repaired} elementos)` : '✓ Todo OK — sin cambios necesarios');
    } catch (err) {
      addLog(`✗ Error: ${err instanceof Error ? err.message : 'Error desconocido'}`);
    } finally {
      setIsRepairing(false);
      setTimeout(() => setLogs([]), 3000);
    }
  };

  const handleSetWgPeer = async () => {
    if (!wgPeerKey.trim()) return;
    setIsSettingPeer(true);
    setLogs([]);
    try {
      addLog('Configurando peer CPE en el servidor...');
      const res = await apiFetch(`${API_BASE_URL}/api/node/wg/set-peer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pppUser: node.ppp_user, cpePublicKey: wgPeerKey.trim() }),
      });
      const data = await res.json() as { success?: boolean; message?: string; peerIP?: string };
      if (data.success) {
        addLog(`✓ Peer configurado — IP ${data.peerIP}`);
        setShowWgPeerForm(false);
        setWgPeerKey('');
        setTimeout(() => setLogs([]), 3000);
      } else {
        addLog(`✗ Error: ${data.message}`);
      }
    } catch (e) {
      addLog(`✗ ${e instanceof Error ? e.message : 'Error'}`);
    } finally {
      setIsSettingPeer(false);
    }
  };

  const openSshForm = async () => {
    setShowSshForm(v => !v);
    if (!showSshForm) {
      try {
        const r = await fetchWithTimeout(`${API_BASE_URL}/api/node/ssh-creds/get`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pppUser: node.ppp_user }),
        }, 5_000);
        const d = await r.json();
        if (d.success && Array.isArray(d.creds) && d.creds.length > 0) {
          setSshCredsArr(d.creds);
        } else {
          setSshCredsArr([{ user: '', pass: '' }]);
        }
      } catch { /* sin creds previas */ }
    }
  };

  const saveSshCreds = async () => {
    const valid = sshCredsArr.filter(c => c.user.trim());
    setSshLoading(true);
    try {
      await fetchWithTimeout(`${API_BASE_URL}/api/node/ssh-creds/save`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pppUser: node.ppp_user, creds: valid }),
      }, 5_000);
      setSshSaved(true);
      setTimeout(() => setSshSaved(false), 2000);
    } catch { /* ignorar */ }
    setSshLoading(false);
  };

  const updateCred = (i: number, field: 'user' | 'pass', value: string) => {
    const next = [...sshCredsArr];
    next[i] = { ...next[i], [field]: value };
    setSshCredsArr(next);
  };

  const removeCred = (i: number) => setSshCredsArr(sshCredsArr.filter((_, idx) => idx !== i));

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
    <Fragment>
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
                {node.service === 'wireguard'
                  ? <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 border border-violet-200 leading-none shrink-0" title="WireGuard">WG</span>
                  : <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 border border-sky-200 leading-none shrink-0" title="SSTP">SSTP</span>
                }
                <p className="font-semibold text-slate-800 text-xs flex-1 leading-tight truncate max-w-[150px]" title={node.nombre_nodo}>
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
            {/* Acceder — acción primaria */}
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

            {/* Revocar — acción primaria */}
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

            {/* Kebab menu — acciones secundarias */}
            <div ref={kebabRef} className="relative">
              <button
                onClick={(e) => {
                  if (!showKebab) {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const spaceBelow = window.innerHeight - rect.bottom;
                    const MENU_HEIGHT = 280;
                    if (spaceBelow < MENU_HEIGHT) {
                      setKebabCoords({
                        bottom: window.innerHeight - rect.top + 4,
                        right: window.innerWidth - rect.right
                      });
                    } else {
                      setKebabCoords({
                        top: rect.bottom + 4,
                        right: window.innerWidth - rect.right
                      });
                    }
                  }
                  setShowKebab(v => !v);
                }}
                title="Más acciones"
                className={`relative p-1.5 rounded-lg transition-colors
                  ${showKebab
                    ? 'text-slate-700 bg-slate-100'
                    : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'}`}
              >
                <MoreVertical className="w-4 h-4" />
                {/* Badge de actividad (logs activos) */}
                {logs.length > 0 && (
                  <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-indigo-500 ring-1 ring-white" />
                )}
              </button>

              {showKebab && createPortal(
                <div 
                  ref={dropdownRef}
                  style={kebabCoords}
                  className="fixed w-52 bg-white border border-slate-200 rounded-xl shadow-lg shadow-slate-200/60 z-[9999] py-1 overflow-hidden"
                >

                  {/* Sección: WireGuard */}
                  {node.service === 'wireguard' && !node.wg_public_key && (
                    <button
                      onClick={() => { setShowWgPeerForm(v => !v); setShowKebab(false); }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-slate-600 hover:bg-violet-50 hover:text-violet-700 transition-colors text-left"
                    >
                      <KeyRound className="w-3.5 h-3.5 text-violet-500 shrink-0" />
                      <span>Configurar peer WireGuard</span>
                    </button>
                  )}

                  {/* Sección: Configuración / Reparar */}
                  {!!node.nombre_vrf && (
                    <button
                      onClick={() => { handleRepair(); setShowKebab(false); }}
                      disabled={isPending || isRepairing}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-slate-600 hover:bg-amber-50 hover:text-amber-700 transition-colors text-left disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {isRepairing
                        ? <Loader2 className="w-3.5 h-3.5 text-amber-500 shrink-0 animate-spin" />
                        : <Wrench className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                      <span>{isRepairing ? 'Reparando...' : 'Verificar y reparar'}</span>
                    </button>
                  )}

                  {/* Sección: Credenciales SSH */}
                  <button
                    onClick={() => { openSshForm(); setShowKebab(false); }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors text-left
                      ${showSshForm
                        ? 'bg-amber-50 text-amber-700'
                        : 'text-slate-600 hover:bg-amber-50 hover:text-amber-700'}`}
                  >
                    <KeyRound className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    <span>Credenciales SSH</span>
                  </button>

                  {/* Divisor */}
                  <div className="my-1 border-t border-slate-100" />

                  {/* Sección: Editar / Eliminar */}
                  <button
                    onClick={() => { onEdit?.(); setShowKebab(false); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-slate-600 hover:bg-indigo-50 hover:text-indigo-700 transition-colors text-left"
                  >
                    <Pencil className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                    <span>Editar nodo</span>
                  </button>

                  <button
                    onClick={() => { onScript?.(); setShowKebab(false); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-slate-600 hover:bg-emerald-50 hover:text-emerald-700 transition-colors text-left"
                  >
                    <FileCode className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    <span>Script de configuración</span>
                  </button>

                  <button
                    onClick={() => { onTagClick?.(); setShowKebab(false); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-slate-600 hover:bg-amber-50 hover:text-amber-700 transition-colors text-left"
                  >
                    <Tag className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>Gestionar etiquetas</span>
                  </button>

                  <button
                    onClick={() => { onHistory?.(); setShowKebab(false); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-slate-600 hover:bg-sky-50 hover:text-sky-700 transition-colors text-left"
                  >
                    <History className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                    <span>Historial de conexión</span>
                  </button>

                  {/* Divisor + Eliminar (acción destructiva al final) */}
                  <div className="my-1 border-t border-slate-100" />

                  <button
                    onClick={() => { onDelete?.(); setShowKebab(false); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-rose-500 hover:bg-rose-50 hover:text-rose-700 transition-colors text-left"
                  >
                    <Trash2 className="w-3.5 h-3.5 shrink-0" />
                    <span>Eliminar nodo</span>
                  </button>

                  {/* Logs activos — ítem informativo al final si hay actividad */}
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

      {/* ── Fila expandida: clave pública CPE WireGuard ── */}
      {showWgPeerForm && (
        <tr className={rowBg}>
          <td colSpan={7} className="px-4 pb-3 pt-0">
            <div className="ml-10 bg-violet-50 border border-violet-200 rounded-xl p-3 space-y-2 animate-in slide-in-from-top-2 duration-200">
              <p className="text-[10px] font-bold text-violet-700 uppercase tracking-wider">Clave Pública del CPE</p>
              <p className="text-[10px] text-violet-500">Obtener con: <span className="font-mono">/interface wireguard print</span></p>
              <textarea
                value={wgPeerKey}
                onChange={e => setWgPeerKey(e.target.value)}
                placeholder="Pegar aquí la public key del router torre..."
                className="w-full font-mono text-xs resize-none rounded-lg border border-violet-200 bg-white px-2 py-1.5 text-slate-700 focus:outline-none focus:border-violet-400"
                rows={3}
              />
              <div className="flex gap-2">
                <button
                  onClick={handleSetWgPeer}
                  disabled={!wgPeerKey.trim() || isSettingPeer}
                  className="flex-1 py-1.5 rounded-lg text-xs font-bold bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {isSettingPeer ? 'Configurando...' : 'Configurar Peer'}
                </button>
                <button
                  onClick={() => { setShowWgPeerForm(false); setWgPeerKey(''); }}
                  className="px-3 py-1.5 rounded-lg text-xs text-slate-500 hover:bg-slate-100 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </td>
        </tr>
      )}

      {/* ── Fila expandida: credenciales SSH ── */}
      {showSshForm && (
        <tr className={rowBg}>
          <td colSpan={7} className="px-4 pb-3 pt-0">
            <div className="ml-10 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider flex items-center gap-1.5">
                  <KeyRound className="w-3 h-3" />
                  Credenciales SSH — {node.nombre_nodo}
                </p>
                <div className="flex items-center gap-1">
                  <button onClick={() => setShowPasswords(v => !v)} title={showPasswords ? 'Ocultar contraseñas' : 'Mostrar contraseñas'}
                    className="p-1 text-slate-400 hover:text-amber-600 rounded transition-colors">
                    {showPasswords ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                  <button onClick={() => setShowSshForm(false)} className="p-1 text-slate-400 hover:text-slate-600 rounded transition-colors">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Lista de pares user/pass */}
              <div className="space-y-2">
                {sshCredsArr.map((cred, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-[10px] font-black text-amber-400 w-4 text-center shrink-0">{i + 1}º</span>
                    <input
                      type="text"
                      placeholder="Usuario (ej: ubnt)"
                      value={cred.user}
                      onChange={e => updateCred(i, 'user', e.target.value)}
                      className="px-3 py-1.5 text-xs border border-amber-200 bg-white rounded-lg outline-none focus:border-amber-400 font-semibold text-slate-700 w-32 flex-1"
                    />
                    <input
                      type={showPasswords ? 'text' : 'password'}
                      placeholder="Contraseña"
                      value={cred.pass}
                      onChange={e => updateCred(i, 'pass', e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && saveSshCreds()}
                      className="px-3 py-1.5 text-xs border border-amber-200 bg-white rounded-lg outline-none focus:border-amber-400 font-mono text-slate-700 w-36 flex-1"
                    />
                    {sshCredsArr.length > 1 && (
                      <button onClick={() => removeCred(i)} className="p-1 text-slate-300 hover:text-rose-500 rounded transition-colors shrink-0">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Acciones */}
              <div className="flex items-center gap-3 pt-1">
                <button
                  onClick={() => { if (sshCredsArr.length < 5) setSshCredsArr([...sshCredsArr, { user: '', pass: '' }]); }}
                  disabled={sshCredsArr.length >= 5}
                  className="flex items-center gap-1 text-[11px] font-bold text-amber-600 hover:text-amber-800 disabled:opacity-40 transition-colors"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>Añadir ({sshCredsArr.length}/5)</span>
                </button>
                <button
                  onClick={saveSshCreds}
                  disabled={sshLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white transition-colors disabled:opacity-50 ml-auto"
                >
                  {sshLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : sshSaved ? <Check className="w-3 h-3" /> : <KeyRound className="w-3 h-3" />}
                  {sshSaved ? 'Guardado' : 'Guardar'}
                </button>
              </div>

              <p className="text-[10px] text-amber-500">
                Se probarán en orden al escanear equipos en este nodo.
              </p>
            </div>
          </td>
        </tr>
      )}
    </Fragment>
  );
}
