import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from '../../../utils/apiClient';
import {
  RefreshCw, Search,
  ShieldCheck, ShieldOff, AlertCircle, Radio, Clock, X,
  Plus, CheckCircle2, Loader2, Eye, EyeOff, Info, Trash2, Pencil, Minus,
  Wifi, Copy, Check, FileCode, UserPlus, Download, History, Upload,
  ArrowUpDown, Tag, SortAsc, SortDesc, Bell, Globe, Server, WifiOff,
} from 'lucide-react';
import { useVpn, TUNNEL_TIMEOUT_MS } from '../../../context';
import { fetchWithTimeout } from '../../../utils/fetchWithTimeout';
import type { NodeInfo, WgPeer } from '../../../types/api';
import NodeCard from '../../VPN/NodeCard';
import { API_BASE_URL } from '../../../config';
import { deviceDb } from '../../../store/deviceDb';
import { cpeCache } from '../../../store/cpeCache';

// ── Modales (importados desde ./modals)
import {
  NuevoNodo,
  EditarNodo,
  EliminarNodo,
  NuevoAdmin,
  BatchCsvModal,
  ScriptModal,
  HistoryModal,
  TagModal,
} from './modals';

// ── Utilidades
import {
  getSubnetConflicts,
  generateSecurePassword,
  type ProvisionStep,
  type ProvisionResult,
  formatCountdown,
} from './utils';

// ── Custom Hooks
import {
  useToasts,
  useNodeModals,
  useNodeTags,
  useServerSettings,
  useWireGuardState,
  useNodeState,
  useNodeFetching,
  useWireGuardPeers,
} from './hooks';

// ── VPS fijo (peer WireGuard principal del servidor) ─────────────────────
const VPS_IP = '192.168.21.60';

// ── Componente Countdown (muestra el tiempo restante en formato mm:ss) ─
function CountdownDisplay({ expiry }: { expiry: number }) {
  const [time, setTime] = useState('');
  useEffect(() => {
    const update = () => setTime(formatCountdown(expiry - Date.now()));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [expiry]);
  return <span>{time}</span>;
}

export default function NodeAccessPanel() {
  const vpnContext = useVpn();
  const { credentials, nodes, setNodes, activeNodeVrf, tunnelExpiry, setTunnelExpiry, adminIP, deactivateAllNodes, removeNodeFromState, isReady } = vpnContext;

  // ── Inicializar Hooks
  const { toasts, addToast } = useToasts();
  const nodeModals = useNodeModals();
  const { nodeTags, setNodeTags, saveNodeTags } = useNodeTags();
  const serverSettings = useServerSettings();
  const wgState = useWireGuardState();
  const nodeState = useNodeState();

  // Extraer valores del nodeState para compatibilidad con JSX
  const { isLoading, setIsLoading, hasLoaded, setHasLoaded, errorMsg, setErrorMsg, isRevoking, setIsRevoking, search, setSearch, sortMode, setSortMode, showRenewalWarn, setShowRenewalWarn, prevRunningRef, pollingRef } = nodeState;

  // Extraer valores del serverSettings
  const { globalServerIP, setGlobalServerIP, editingGlobalIP, setEditingGlobalIP, serverPublicKey, setServerPublicKey, serverListenPort, setServerListenPort, serverEndpointIP, setServerEndpointIP } = serverSettings;

  // Extraer valores del wgState
  const { wgPeers, setWgPeers, loadingWg, setLoadingWg, wgError, setWgError, showNuevoAdmin, setShowNuevoAdmin, peersExpanded, setPeersExpanded, peerColors, setPeerColors, colorPickerAddr, setColorPickerAddr, editingPeerId, setEditingPeerId, editingPeerName, setEditingPeerName, savingPeerName, setSavingPeerName, copiedPeerId, setCopiedPeerId, wgLoadedRef } = wgState;

  // Extraer valores del nodeModals
  const { showNuevoNodo, setShowNuevoNodo, showBatchCsv, setShowBatchCsv, editNode, setEditNode, deleteNode, setDeleteNode, scriptNode, setScriptNode, historyNode, setHistoryNode, tagNode, setTagNode } = nodeModals;

  const PEER_COLOR_PALETTE = ['#6366f1', '#10b981', '#0ea5e9', '#f59e0b', '#f43f5e', '#8b5cf6', '#f97316', '#14b8a6', '#ec4899', '#64748b'];

  // ── Inicializar hooks de lógica compleja
  const { fetchNodes, handleLoadNodes } = useNodeFetching({
    credentials,
    isReady,
    hasLoaded,
    setHasLoaded,
    setNodes,
    setIsLoading,
    setErrorMsg,
    setShowRenewalWarn,
    tunnelExpiry,
    prevRunningRef,
    pollingRef,
    addToast,
  });

  const { loadWgPeers, savePeerColor, savePeerName, copyWgConfig } = useWireGuardPeers({
    credentials,
    wgLoadedRef,
    setWgPeers,
    setPeerColors,
    setServerPublicKey,
    setServerListenPort,
    setServerEndpointIP,
    setLoadingWg,
    setWgError,
    setColorPickerAddr,
    setEditingPeerId,
    setEditingPeerName,
    setSavingPeerName,
    setCopiedPeerId,
    serverEndpointIP,
    serverListenPort,
    serverPublicKey,
    editingPeerName,
    savingPeerName,
  });

  const exportCsv = () => {
    const header = 'Nombre,VRF,Red LAN,IP Túnel,Usuario PPP,Estado';
    const csvRows = nodes.map(n => [
      `"${n.nombre_nodo}"`, n.nombre_vrf || '',
      `"${(n.lan_subnets?.join(';') || n.segmento_lan || '')}"`,
      n.ip_tunnel || '', n.ppp_user,
      n.running ? 'Conectado' : 'Desconectado',
    ].join(','));
    const blob = new Blob([[header, ...csvRows].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `nodos-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const handleRevokeAll = async () => {
    setIsRevoking(true);
    await deactivateAllNodes();
    setIsRevoking(false);
  };


  const connectedNodes = nodes.filter(n => n.running);
  const disconnectedNodes = nodes.filter(n => !n.running);
  const nodesWithVrf = nodes.filter(n => !!n.nombre_vrf);
  const activeNodeName = activeNodeVrf
    ? nodes.find(n => n.nombre_vrf === activeNodeVrf)?.nombre_nodo ?? activeNodeVrf
    : null;

  // ── Separación VPS vs administradores humanos ───────────────────────────
  const vpsPeer = wgPeers.find(p => p.allowedAddress === VPS_IP);
  const adminPeers = wgPeers.filter(p => p.allowedAddress !== VPS_IP);
  const vpsWgActive = !!vpsPeer?.active;
  const mangleActive = !!activeNodeVrf;

  const q = search.trim().toLowerCase();
  const baseNodes = q
    ? nodes.filter(n =>
      n.nombre_nodo?.toLowerCase().includes(q) ||
      n.nombre_vrf?.toLowerCase().includes(q) ||
      n.segmento_lan?.toLowerCase().includes(q) ||
      n.ppp_user?.toLowerCase().includes(q)
    )
    : nodes;
  const filteredNodes = sortMode === 'connected'
    ? [...baseNodes].sort((a, b) => (b.running ? 1 : 0) - (a.running ? 1 : 0))
    : sortMode === 'disconnected'
      ? [...baseNodes].sort((a, b) => (a.running ? 1 : 0) - (b.running ? 1 : 0))
      : baseNodes;

  return (
    <div className="space-y-5">

      {/* ── Header ── */}
      <div className="card p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center space-x-2">
            <Radio className="w-5 h-5 text-indigo-500" />
            <span>Acceso a Nodos VRF</span>
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            Abre acceso a APs y CPEs remotos mediante enrutamiento VRF
          </p>
          {/* IP global del servidor SSTP */}
          <div className="flex items-center gap-1.5 mt-2">
            <Globe className="w-3 h-3 text-slate-400" />
            <span className="text-[11px] text-slate-400 font-medium">Servidor SSTP:</span>
            {editingGlobalIP ? (
              <input
                value={globalServerIP}
                onChange={e => setGlobalServerIP(e.target.value)}
                onBlur={() => {
                  const ip = globalServerIP.trim();
                  localStorage.setItem('server_public_ip', ip);
                  apiFetch(`${API_BASE_URL}/api/settings/save`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'server_public_ip', value: ip }) }).catch(() => { });
                  setEditingGlobalIP(false);
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    const ip = globalServerIP.trim();
                    localStorage.setItem('server_public_ip', ip);
                    apiFetch(`${API_BASE_URL}/api/settings/save`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'server_public_ip', value: ip }) }).catch(() => { });
                    setEditingGlobalIP(false);
                  }
                  if (e.key === 'Escape') { setGlobalServerIP(localStorage.getItem('server_public_ip') || ''); setEditingGlobalIP(false); }
                }}
                placeholder="Ej: 213.173.36.232"
                className="px-2 py-0.5 text-[11px] font-mono border border-indigo-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-400 w-36"
                autoFocus
              />
            ) : (
              <button onClick={() => setEditingGlobalIP(true)} className="flex items-center gap-1 group">
                <span className={`text-[11px] font-mono font-semibold ${globalServerIP ? 'text-slate-700' : 'text-slate-400 italic'}`}>
                  {globalServerIP || 'Sin configurar'}
                </span>
                <Pencil className="w-2.5 h-2.5 text-slate-300 group-hover:text-indigo-500 transition-colors" />
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShowNuevoNodo(true)}
            className="px-4 py-2.5 flex items-center space-x-2 rounded-xl text-sm font-bold
                       bg-emerald-500 hover:bg-emerald-600 text-white shadow-md shadow-emerald-500/25 transition-all active:scale-[0.98]"
          >
            <Plus className="w-4 h-4" />
            <span>Nuevo Nodo</span>
          </button>
          <button
            onClick={() => setShowBatchCsv(true)}
            title="Provisionar múltiples nodos desde CSV"
            className="px-4 py-2.5 flex items-center space-x-2 rounded-xl text-sm font-bold
                       bg-violet-500 hover:bg-violet-600 text-white shadow-md shadow-violet-500/25 transition-all active:scale-[0.98]"
          >
            <Download className="w-4 h-4" />
            <span>CSV</span>
          </button>
          <button
            onClick={handleLoadNodes}
            disabled={isLoading}
            className="btn-primary px-6 py-3 flex items-center space-x-2"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            <span>{isLoading ? 'Cargando...' : hasLoaded ? 'Actualizar Nodos' : 'Cargar Nodos'}</span>
          </button>
        </div>
      </div>

      {/* ── Error ── */}
      {errorMsg && (
        <div className="card p-4 flex items-start space-x-3 border-red-200 bg-red-50">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <p className="text-sm text-red-600 font-medium">{errorMsg}</p>
        </div>
      )}

      {/* ── Túnel activo ── */}
      {activeNodeVrf && (
        <>
          <div className="card p-4 border-emerald-200 bg-gradient-to-r from-emerald-50 to-sky-50 flex items-center justify-between gap-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center shadow-md shadow-emerald-500/30">
                <ShieldCheck className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-800">
                  Acceso abierto: <span className="text-emerald-600">{activeNodeName}</span>
                </p>
                <div className="flex items-center space-x-2 mt-0.5">
                  <span className="text-xs text-slate-500 font-mono">{activeNodeVrf}</span>
                  {tunnelExpiry && (
                    <span className="text-xs font-bold text-amber-600 flex items-center space-x-1">
                      <Clock className="w-3 h-3" />
                      <CountdownDisplay expiry={tunnelExpiry} />
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {showRenewalWarn && (
                <button onClick={() => setTunnelExpiry(Date.now() + TUNNEL_TIMEOUT_MS)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white shadow-sm shadow-amber-500/30 animate-pulse transition-all">
                  <Bell className="w-3.5 h-3.5" />
                  <span>Renovar acceso</span>
                </button>
              )}
              <button
                onClick={handleRevokeAll}
                disabled={isRevoking}
                className="bg-rose-500 hover:bg-rose-600 text-white font-bold text-sm px-4 py-2.5 rounded-xl
                           shadow-md shadow-rose-500/25 active:scale-[0.98] transition-all flex items-center space-x-2"
              >
                <ShieldOff className="w-4 h-4" />
                <span>{isRevoking ? 'Revocando...' : 'Revocar Todo'}</span>
              </button>
            </div>
          </div>
          {showRenewalWarn && (
            <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 font-semibold">
              <Bell className="w-3.5 h-3.5 animate-pulse shrink-0" />
              <span>El acceso expirará en menos de 2 minutos. Haz clic en "Renovar acceso" para extenderlo 30 minutos más sin interrumpir la conexión.</span>
            </div>
          )}
        </>
      )}

      {/* ── Error de conexión al router ── */}
      {wgError && !loadingWg && (
        <div className="card p-4 border-red-200 bg-red-50 flex items-center gap-3">
          <WifiOff className="w-5 h-5 text-red-500 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-red-700">Router no alcanzable</p>
            <p className="text-[11px] text-red-600">{wgError}</p>
          </div>
          <button
            onClick={loadWgPeers}
            className="text-xs font-semibold text-red-700 bg-red-100 hover:bg-red-200 px-3 py-1.5 rounded-lg transition-colors shrink-0"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* ── VPS (Principal) ── */}
      {!vpsPeer && !loadingWg && !wgError && (
        <div className="card p-4 border-amber-200 bg-amber-50 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-bold text-amber-700">VPS no encontrado en peers WireGuard</p>
            <p className="text-[11px] text-amber-600">Se esperaba un peer con <span className="font-mono">{VPS_IP}</span>. Verifica la configuración del servidor.</p>
          </div>
        </div>
      )}
      {vpsPeer && (
        <div
          className={`card p-4 border transition-colors ${
            vpsWgActive && mangleActive
              ? 'border-emerald-300 bg-gradient-to-r from-emerald-50 to-teal-50'
              : vpsWgActive
                ? 'border-sky-200 bg-sky-50/50'
                : 'border-slate-200 bg-slate-50'
          }`}
        >
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-md shrink-0 ${
                  vpsWgActive && mangleActive
                    ? 'bg-emerald-500 shadow-emerald-500/30'
                    : vpsWgActive
                      ? 'bg-sky-400 shadow-sky-400/30'
                      : 'bg-slate-400 shadow-slate-400/20'
                }`}
              >
                <Server className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-bold text-slate-800">VPS (Principal)</p>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-slate-900/5 text-slate-600 font-mono">
                    {VPS_IP}
                  </span>
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md flex items-center gap-1 ${
                      vpsWgActive
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-slate-100 text-slate-400'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        vpsWgActive && mangleActive
                          ? 'bg-emerald-500 animate-pulse'
                          : vpsWgActive
                            ? 'bg-sky-400'
                            : 'bg-slate-400'
                      }`}
                    />
                    <span>WG {vpsWgActive ? 'activo' : 'inactivo'}</span>
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span
                    className={`text-[11px] font-semibold flex items-center gap-1 ${
                      mangleActive ? 'text-emerald-600' : 'text-slate-400'
                    }`}
                  >
                    <ShieldCheck className="w-3 h-3" />
                    {mangleActive
                      ? <>Mangle aplicado: <span className="font-mono">{activeNodeVrf}</span></>
                      : 'Sin mangle activo'}
                  </span>
                  {mangleActive && activeNodeName && (
                    <span className="text-[11px] text-slate-500">
                      → <span className="font-semibold text-slate-700">{activeNodeName}</span>
                    </span>
                  )}
                </div>
              </div>
            </div>
            <span
              className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg shrink-0 ${
                vpsWgActive && mangleActive
                  ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/30'
                  : vpsWgActive
                    ? 'bg-sky-100 text-sky-700 border border-sky-200'
                    : 'bg-slate-100 text-slate-500 border border-slate-200'
              }`}
            >
              {vpsWgActive && mangleActive
                ? 'Enrutando'
                : vpsWgActive
                  ? 'En espera'
                  : 'Sin conexión'}
            </span>
          </div>
        </div>
      )}

      {/* ── Admin IP (WireGuard peers) ── */}
      <div className="card p-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-600">IP Administrador</span>
            {adminPeers.length > 0 && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-500">
                {adminPeers.filter(p => p.active).length}/{adminPeers.length} activos
              </span>
            )}
            {loadingWg && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />}
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={loadWgPeers} disabled={loadingWg} title="Actualizar lista"
              className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors">
              <RefreshCw className={`w-3.5 h-3.5 ${loadingWg ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={() => setShowNuevoAdmin(true)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border border-indigo-200 transition-colors">
              <UserPlus className="w-3 h-3" /><span>Nuevo</span>
            </button>
            {adminPeers.length > 0 && (
              <button onClick={() => setPeersExpanded(v => !v)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-500 hover:bg-slate-100 border border-slate-200 transition-colors">
                <span>{peersExpanded ? 'Contraer' : 'Ver todos'}</span>
                <span className={`transition-transform ${peersExpanded ? 'rotate-180' : ''}`}>▾</span>
              </button>
            )}
          </div>
        </div>

        {/* Collapsed: administradores humanos (solo lectura) */}
        {!peersExpanded && (
          <div className="flex items-center flex-wrap gap-2 mt-3">
            {adminPeers.length === 0 && !loadingWg && (
              <span className="text-xs text-slate-400 italic">No hay administradores configurados</span>
            )}
            {adminPeers.map(peer => {
              const color = peerColors[peer.allowedAddress];
              const isSelected = activeNodeVrf !== null && adminIP === peer.allowedAddress;
              return (
                <div
                  key={peer.id}
                  style={isSelected && color ? { borderColor: color, backgroundColor: color } : color ? { borderColor: color } : undefined}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold border transition-all
                    ${isSelected
                      ? color ? 'text-white shadow-md' : 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-500/25'
                      : peer.active
                        ? 'bg-white text-slate-700 border-slate-200'
                        : 'bg-slate-50 text-slate-400 border-slate-200'}`}
                >
                  {color
                    ? <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: isSelected ? '#fff' : color }} />
                    : <Wifi className={`w-3.5 h-3.5 ${peer.active ? '' : 'opacity-50'}`} />}
                  <span>{peer.name}</span>
                  <span className="font-mono text-[10px] opacity-70">{peer.allowedAddress}</span>
                  <span
                    className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${
                      isSelected
                        ? 'bg-white/25 text-white'
                        : peer.active
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-slate-100 text-slate-400'
                    }`}
                  >
                    {peer.active ? 'Activo' : 'Inactivo'}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Expanded: solo activos, con selector de color y copiar config */}
        {peersExpanded && (
          <div className="mt-4 space-y-3">
            {/* Endpoint config */}
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0">Endpoint servidor:</span>
              <input value={serverEndpointIP}
                onChange={e => { setServerEndpointIP(e.target.value); localStorage.setItem('wg_endpoint_ip', e.target.value); }}
                placeholder="IP pública del servidor"
                className="flex-1 px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 font-mono" />
              <span className="text-slate-400 font-bold text-xs">:</span>
              <input value={serverListenPort} onChange={e => setServerListenPort(e.target.value)}
                placeholder="Puerto"
                className="w-20 px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 font-mono" />
            </div>

            {adminPeers.length === 0 && (
              <p className="text-xs text-slate-400 italic text-center py-4">Sin administradores configurados</p>
            )}

            {adminPeers.map(peer => {
              const color = peerColors[peer.allowedAddress];
              const showPicker = colorPickerAddr === peer.allowedAddress;
              const isEditing = editingPeerId === peer.id;
              return (
                <div key={peer.id} className="rounded-xl border border-slate-200 overflow-hidden">
                  <div className={`flex items-center gap-3 px-3 py-2.5 ${peer.active ? 'bg-white' : 'bg-slate-50'}`}>
                    {/* Color dot / picker trigger */}
                    <button onClick={() => { setColorPickerAddr(showPicker ? null : peer.allowedAddress); setEditingPeerId(null); }}
                      title="Cambiar color"
                      className="w-5 h-5 rounded-full shrink-0 border-2 border-white shadow ring-1 ring-slate-200 transition-transform hover:scale-110"
                      style={{ backgroundColor: color || '#94a3b8' }} />

                    {/* Nombre editable / info */}
                    <div className="flex-1 min-w-0">
                      {isEditing ? (
                        <div className="flex items-center gap-1.5">
                          <input autoFocus value={editingPeerName} onChange={e => setEditingPeerName(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') savePeerName(peer); if (e.key === 'Escape') setEditingPeerId(null); }}
                            className="flex-1 px-2 py-1 text-xs border border-indigo-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 font-semibold" />
                          <button onClick={() => savePeerName(peer)} disabled={savingPeerName}
                            className="p-1 rounded text-emerald-600 hover:bg-emerald-50">
                            {savingPeerName ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                          </button>
                          <button onClick={() => setEditingPeerId(null)} className="p-1 rounded text-slate-400 hover:bg-slate-100">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 group">
                          <p className={`text-xs font-bold truncate ${peer.active ? 'text-slate-700' : 'text-slate-400'}`}>{peer.name}</p>
                          <button onClick={() => { setEditingPeerId(peer.id); setEditingPeerName(peer.name); setColorPickerAddr(null); }}
                            className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-slate-400 hover:text-indigo-600 transition-opacity">
                            <Pencil className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      )}
                      <p className="font-mono text-[10px] text-slate-500">{peer.allowedAddress}</p>
                    </div>

                    {/* Estado */}
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md shrink-0
                      ${peer.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                      {peer.active ? 'Activo' : 'Inactivo'}
                    </span>

                    {/* Copiar config WG */}
                    <button onClick={() => copyWgConfig(peer)}
                      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-colors shrink-0
                        ${copiedPeerId === peer.id ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600 hover:bg-emerald-50 hover:text-emerald-700 border border-slate-200'}`}>
                      {copiedPeerId === peer.id ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedPeerId === peer.id ? '¡Copiado!' : 'Config WG'}</span>
                    </button>
                  </div>

                  {/* Color picker */}
                  {showPicker && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border-t border-slate-100">
                      <span className="text-[10px] font-bold text-slate-400 shrink-0">Color:</span>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {PEER_COLOR_PALETTE.map(c => (
                          <button key={c} onClick={() => savePeerColor(peer.allowedAddress, c)}
                            className="w-5 h-5 rounded-full transition-transform hover:scale-110"
                            style={{ backgroundColor: c, outline: color === c ? `2px solid ${c}` : 'none', outlineOffset: '2px' }} />
                        ))}
                        {color && (
                          <button onClick={() => savePeerColor(peer.allowedAddress, '')}
                            className="text-[10px] text-slate-400 hover:text-slate-600 ml-1">✕ quitar</button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Banner caché local (MikroTik offline) ── */}
      {hasLoaded && nodes.length > 0 && nodes.some(n => n.cached) && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-xs">
          <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="font-bold text-amber-700">MikroTik no disponible</span>
            <span className="text-amber-600 ml-1.5">
              Mostrando {nodes.length} nodo{nodes.length !== 1 ? 's' : ''} desde la base de datos local.
              {nodes[0]?.last_seen ? ` Última sincronización: ${new Date(nodes[0].last_seen).toLocaleString('es', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''}
            </span>
          </div>
          <button onClick={fetchNodes}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-100 border border-amber-300 text-amber-700 font-bold hover:bg-amber-200 transition-colors shrink-0">
            <RefreshCw className="w-3 h-3" />
            Reintentar
          </button>
        </div>
      )}

      {/* ── Tabla de nodos ── */}
      {hasLoaded && nodes.length > 0 && (
        <div className="card overflow-hidden">

          {/* Barra superior: stats + búsqueda + controles */}
          <div className="px-5 py-3.5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/60">
            {/* Stats inline */}
            <div className="flex items-center gap-4 text-xs flex-wrap">
              <span className="text-slate-400 font-medium">
                <span className="font-bold text-slate-700">{nodes.length}</span> nodos
              </span>
              <span className="text-slate-200">|</span>
              <span className="text-emerald-600 font-semibold">
                <span className="font-bold">{connectedNodes.length}</span> conectados
              </span>
              <span className="text-slate-200">|</span>
              <span className="text-sky-600 font-semibold">
                <span className="font-bold">{nodesWithVrf.length}</span> con VRF
              </span>
              <span className="text-slate-200">|</span>
              <span className="text-rose-500 font-semibold">
                <span className="font-bold">{disconnectedNodes.length}</span> desconectados
              </span>
            </div>

            {/* Controles: sort + export + búsqueda */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Ordenar */}
              <button onClick={() => setSortMode(m => m === 'default' ? 'connected' : m === 'connected' ? 'disconnected' : 'default')}
                title={sortMode === 'default' ? 'Orden original' : sortMode === 'connected' ? 'Conectados primero' : 'Desconectados primero'}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-colors
                  ${sortMode !== 'default' ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'bg-white border-slate-200 text-slate-500 hover:border-indigo-200'}`}>
                {sortMode === 'connected' ? <SortAsc className="w-3.5 h-3.5" /> : sortMode === 'disconnected' ? <SortDesc className="w-3.5 h-3.5" /> : <ArrowUpDown className="w-3.5 h-3.5" />}
                <span>{sortMode === 'connected' ? 'Conectados' : sortMode === 'disconnected' ? 'Desconectados' : 'Ordenar'}</span>
              </button>
              {/* Exportar CSV */}
              <button onClick={exportCsv} title="Exportar inventario a CSV"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold border border-slate-200 bg-white text-slate-500 hover:border-emerald-300 hover:text-emerald-600 transition-colors">
                <Download className="w-3.5 h-3.5" />
                <span>CSV</span>
              </button>
            </div>

            {/* Búsqueda */}
            <div className="relative w-full sm:w-64">
              {/* Dummy inputs para atrapar el autofill agresivo de Chrome/Edge */}
              <input type="text" name="dummy-user" style={{ display: 'none' }} />
              <input type="password" name="dummy-pass" style={{ display: 'none' }} />

              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                name="node-search-filter-off"
                autoComplete="new-password"
                placeholder="Buscar nodo, VRF, red, usuario…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-8 pr-8 py-2 text-xs rounded-xl border border-slate-200
                           bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400
                           placeholder:text-slate-400 text-slate-700"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Tabla */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-100">
                  <th className="px-4 py-4 text-left font-bold text-slate-500 uppercase tracking-wider w-8">#</th>
                  <th className="px-4 py-4 text-left font-bold text-slate-500 uppercase tracking-wider">Nodo</th>
                  <th className="px-4 py-4 text-left font-bold text-slate-500 uppercase tracking-wider">VRF</th>
                  <th className="px-4 py-4 text-left font-bold text-slate-500 uppercase tracking-wider">Red LAN</th>
                  <th className="px-4 py-4 text-left font-bold text-slate-500 uppercase tracking-wider">IP Túnel</th>
                  <th className="px-4 py-4 text-left font-bold text-slate-500 uppercase tracking-wider">Usuario PPP</th>
                  <th className="px-4 py-4 text-right font-bold text-slate-500 uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredNodes.map((node, idx) => (
                  <NodeCard
                    key={node.id} node={node} rowIndex={idx}
                    onEdit={() => setEditNode(node)}
                    onDelete={() => setDeleteNode(node)}
                    onScript={() => setScriptNode(node)}
                    onRename={(newName) => setNodes(prev => prev.map(n => n.ppp_user === node.ppp_user ? { ...n, nombre_nodo: newName } : n))}
                    onHistory={() => setHistoryNode(node)}
                    onTagClick={() => setTagNode(node)}
                    tags={nodeTags[node.ppp_user] || []}
                  />
                ))}
                {filteredNodes.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                      Sin resultados para <span className="font-mono font-bold">"{search}"</span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Empty state ── */}
      {hasLoaded && nodes.length === 0 && !errorMsg && (
        <div className="card border-dashed border-2 border-slate-200 py-16 flex flex-col items-center text-center space-y-3">
          <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center">
            <Radio className="w-7 h-7 text-indigo-400" />
          </div>
          <p className="text-slate-500 font-medium">Sin nodos SSTP</p>
          <p className="text-slate-400 text-sm">El router no tiene túneles SSTP configurados</p>
        </div>
      )}

      {/* ── Estado inicial ── */}
      {!hasLoaded && !isLoading && (
        <div className="card border-dashed border-2 border-slate-200 py-16 flex flex-col items-center text-center space-y-3">
          <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center">
            <Search className="w-7 h-7 text-indigo-400" />
          </div>
          <p className="text-slate-500 font-medium">Sin datos aún</p>
          <p className="text-slate-400 text-sm">Haz clic en "Cargar Nodos" para obtener los túneles VRF del router</p>
        </div>
      )}

      {showNuevoNodo && (
        <NuevoNodoModal
          onClose={() => setShowNuevoNodo(false)}
          onSuccess={() => { setShowNuevoNodo(false); handleLoadNodes(); }}
        />
      )}
      {deleteNode && (
        <EliminarNodoModal
          node={deleteNode}
          onClose={() => setDeleteNode(null)}
          onSuccess={(deletedDeviceIds: string[]) => {
            const pppUser = deleteNode.ppp_user;
            setDeleteNode(null);
            removeNodeFromState(pppUser);
            // Limpiar devices huérfanos de SQLite + cache IndexedDB de CPEs
            deviceDb.cleanupOrphans().catch(() => { });
            if (deletedDeviceIds.length > 0) {
              deviceDb.removeByIds(deletedDeviceIds).catch(() => { });
            }
            cpeCache.clear().catch(() => { });
          }}
        />
      )}
      {editNode && (
        <EditarNodoModal
          node={editNode}
          onClose={() => setEditNode(null)}
          onSuccess={(newLabel) => {
            if (newLabel) {
              setNodes(prev => prev.map(n => n.id === editNode.id ? { ...n, nombre_nodo: newLabel } : n));
            }
            setEditNode(null);
            handleLoadNodes();
          }}
        />
      )}
      {showNuevoAdmin && (
        <NuevoAdminModal
          peers={wgPeers}
          onClose={() => setShowNuevoAdmin(false)}
          onSuccess={(newPeer) => { setWgPeers(prev => [...prev, newPeer]); setShowNuevoAdmin(false); }}
        />
      )}
      {scriptNode && (
        <ScriptModal node={scriptNode} onClose={() => setScriptNode(null)} />
      )}
      {showBatchCsv && (
        <BatchCsvModal nodes={nodes} onClose={() => setShowBatchCsv(false)} onSuccess={() => { setShowBatchCsv(false); handleLoadNodes(); }} />
      )}
      {historyNode && (
        <HistoryModal node={historyNode} onClose={() => setHistoryNode(null)} />
      )}
      {tagNode && (
        <TagModal
          node={tagNode}
          currentTags={nodeTags[tagNode.ppp_user] || []}
          onSave={(tags) => saveNodeTags(tagNode.ppp_user, tags)}
          onClose={() => setTagNode(null)}
        />
      )}

      {/* ── Toast notifications ── */}
      {toasts.length > 0 && (
        <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 items-end">
          {toasts.map(t => (
            <div key={t.id}
              className={`flex items-center gap-3 px-4 py-3 rounded-2xl shadow-lg text-sm font-semibold max-w-xs animate-in slide-in-from-right-4 duration-300
                ${t.type === 'warn' ? 'bg-rose-600 text-white' : 'bg-indigo-600 text-white'}`}>
              <Bell className="w-4 h-4 shrink-0" />
              <span>{t.text}</span>
              <button onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))} className="ml-1 opacity-70 hover:opacity-100">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
