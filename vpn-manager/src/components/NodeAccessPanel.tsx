import { useState, useEffect } from 'react';
import {
  RefreshCw, Search, Laptop, Smartphone, Monitor,
  ShieldCheck, ShieldOff, AlertCircle, Radio, Clock,
} from 'lucide-react';
import { useVpn } from '../context/VpnContext';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';
import type { NodeInfo } from '../types/api';
import NodeCard from './NodeCard';

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

  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isRevoking, setIsRevoking] = useState(false);

  const handleLoadNodes = async () => {
    if (!credentials) return;
    setIsLoading(true);
    setErrorMsg('');
    try {
      // Timeout 20s: el backend puede tardar hasta 16s si intenta 8728 y reintenta en 8729
      const res = await fetchWithTimeout('http://localhost:3001/api/nodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ip: credentials.ip,
          user: credentials.user,
          pass: credentials.pass,
        }),
      }, 20_000);
      const data = await res.json();
      if (!res.ok) {
        throw new Error((data as { message?: string }).message ?? `HTTP ${res.status}`);
      }
      const nodeList: NodeInfo[] = Array.isArray(data) ? data : [];
      setNodes(nodeList);
      setHasLoaded(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      setErrorMsg(`Error: ${msg}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRevokeAll = async () => {
    setIsRevoking(true);
    await deactivateAllNodes();
    setIsRevoking(false);
  };

  const connectedNodes = nodes.filter((n) => n.running);
  const disconnectedNodes = nodes.filter((n) => !n.running);
  const nodesWithVrf = nodes.filter((n) => !!n.nombre_vrf);
  const activeNodeName = activeNodeVrf
    ? nodes.find((n) => n.nombre_vrf === activeNodeVrf)?.nombre_nodo ?? activeNodeVrf
    : null;

  return (
    <div className="space-y-5">

      {/* Header */}
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

      {/* Error */}
      {errorMsg && (
        <div className="card p-4 flex items-start space-x-3 border-red-200 bg-red-50">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <p className="text-sm text-red-600 font-medium">{errorMsg}</p>
        </div>
      )}

      {/* Global status bar when a tunnel is active */}
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

      {/* Admin IP selector */}
      {hasLoaded && (
        <div className="card p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <span className="text-sm font-semibold text-slate-600">IP Administrador:</span>
          <div className="flex items-center space-x-2 flex-wrap gap-y-2">
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

      {/* Stats */}
      {hasLoaded && nodes.length > 0 && (
        <div className="card p-4 flex items-center gap-6 bg-slate-50/50 flex-wrap">
          <div className="flex items-center space-x-2 text-sm">
            <span className="font-bold text-indigo-600">{nodes.length}</span>
            <span className="text-slate-500">nodos totales</span>
          </div>
          <span className="text-slate-200">|</span>
          <div className="flex items-center space-x-2 text-sm">
            <span className="font-bold text-emerald-600">{connectedNodes.length}</span>
            <span className="text-slate-500">conectados</span>
          </div>
          <span className="text-slate-200">|</span>
          <div className="flex items-center space-x-2 text-sm">
            <span className="font-bold text-sky-600">{nodesWithVrf.length}</span>
            <span className="text-slate-500">con VRF</span>
          </div>
          <span className="text-slate-200">|</span>
          <div className="flex items-center space-x-2 text-sm">
            <span className="font-bold text-rose-500">{disconnectedNodes.length}</span>
            <span className="text-slate-500">desconectados</span>
          </div>
        </div>
      )}

      {/* Node cards grid */}
      {hasLoaded && nodes.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {nodes.map((node) => (
            <NodeCard key={node.id} node={node} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {hasLoaded && nodes.length === 0 && !errorMsg && (
        <div className="card border-dashed border-2 border-slate-200 py-16 flex flex-col items-center text-center space-y-3">
          <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center">
            <Radio className="w-7 h-7 text-indigo-400" />
          </div>
          <p className="text-slate-500 font-medium">Sin nodos SSTP</p>
          <p className="text-slate-400 text-sm">El router no tiene túneles SSTP configurados</p>
        </div>
      )}

      {/* Initial state */}
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

/** Helper — live countdown display */
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
