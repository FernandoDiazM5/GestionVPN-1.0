import { useState, useEffect } from 'react';
import {
  RefreshCw, Search, Laptop, Smartphone, Monitor,
  ShieldCheck, ShieldOff, AlertCircle, Radio, Clock, X,
} from 'lucide-react';
import { useVpn } from '../context/VpnContext';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';
import type { NodeInfo } from '../types/api';
import NodeCard from './NodeCard';
import { API_BASE_URL } from '../config';

const ADMIN_IPS = [
  { value: '192.168.21.20', label: 'Laptop', icon: Laptop },
  { value: '192.168.21.30', label: 'Celular', icon: Smartphone },
  { value: '192.168.21.50', label: 'PC FiWis', icon: Monitor },
];

function formatCountdown(ms: number): string {
  if (ms <= 0) return '00:00';
  const totalSecs = Math.floor(ms / 1000);
  const m = Math.floor(totalSecs / 60);
  const s = totalSecs % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function NodeAccessPanel() {
  const {
    credentials,
    nodes, setNodes,
    activeNodeVrf,
    tunnelExpiry,
    adminIP, setAdminIP,
    deactivateAllNodes,
  } = useVpn();

  // Si ya hay nodos en contexto (persistidos) mostramos directo sin necesidad de recargar
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(nodes.length > 0);
  const [errorMsg, setErrorMsg] = useState('');
  const [isRevoking, setIsRevoking] = useState(false);
  const [search, setSearch] = useState('');

  const handleLoadNodes = async () => {
    if (!credentials) return;
    setIsLoading(true);
    setErrorMsg('');
    try {
      const res = await fetchWithTimeout(`${API_BASE_URL}/api/nodes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ip: credentials.ip,
          user: credentials.user,
          pass: credentials.pass,
        }),
      }, 20_000);
      const data = await res.json();
      if (!res.ok) throw new Error((data as { message?: string }).message ?? `HTTP ${res.status}`);
      const nodeList: NodeInfo[] = Array.isArray(data) ? data : [];
      setNodes(nodeList);
      setHasLoaded(true);
    } catch (err: unknown) {
      setErrorMsg(`Error: ${err instanceof Error ? err.message : 'Error desconocido'}`);
    } finally {
      setIsLoading(false);
    }
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

  const q = search.trim().toLowerCase();
  const filteredNodes = q
    ? nodes.filter(n =>
      n.nombre_nodo?.toLowerCase().includes(q) ||
      n.nombre_vrf?.toLowerCase().includes(q) ||
      n.segmento_lan?.toLowerCase().includes(q) ||
      n.ppp_user?.toLowerCase().includes(q)
    )
    : nodes;

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
        </div>
        <button
          onClick={handleLoadNodes}
          disabled={isLoading}
          className="btn-primary px-6 py-3 flex items-center space-x-2 shrink-0"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          <span>{isLoading ? 'Cargando...' : hasLoaded ? 'Actualizar Nodos' : 'Cargar Nodos'}</span>
        </button>
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
      )}

      {/* ── Admin IP ── */}
      {hasLoaded && (
        <div className="card p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <span className="text-sm font-semibold text-slate-600 shrink-0">IP Administrador:</span>
          <div className="flex items-center flex-wrap gap-2">
            {ADMIN_IPS.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                onClick={() => setAdminIP(value)}
                className={`flex items-center space-x-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all border
                  ${adminIP === value
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-500/25'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:bg-indigo-50'}`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{label}</span>
                <span className="font-mono text-[10px] opacity-70">{value}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Tabla de nodos ── */}
      {hasLoaded && nodes.length > 0 && (
        <div className="card overflow-hidden">

          {/* Barra superior: stats + búsqueda */}
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

            {/* Búsqueda */}
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
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
                <tr className="border-b border-slate-100 bg-slate-50/40">
                  <th className="px-4 py-3 text-left font-semibold text-slate-500 uppercase tracking-wider w-8">#</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-500 uppercase tracking-wider">Nodo</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-500 uppercase tracking-wider">VRF</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-500 uppercase tracking-wider">Red LAN</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-500 uppercase tracking-wider">IP Túnel</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-500 uppercase tracking-wider">Usuario PPP</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-500 uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredNodes.map((node, idx) => (
                  <NodeCard key={node.id} node={node} rowIndex={idx} />
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
    </div>
  );
}

function CountdownDisplay({ expiry }: { expiry: number }) {
  const [text, setText] = useState(() => formatCountdown(expiry - Date.now()));
  useEffect(() => {
    const tick = () => setText(formatCountdown(expiry - Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiry]);
  return <span>{text || '—'}</span>;
}
