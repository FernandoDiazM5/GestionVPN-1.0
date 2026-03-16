import { useState, useEffect, useRef } from 'react';
import { Play, ShieldOff, Wifi, WifiOff, Clock, Loader2, Activity, Radio } from 'lucide-react';
import { useVpn, TUNNEL_TIMEOUT_MS } from '../context/VpnContext';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';
import type { NodeInfo, TunnelActivateResponse } from '../types/api';

interface NodeCardProps {
  node: NodeInfo;
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return '00:00';
  const totalSecs = Math.floor(ms / 1000);
  const m = Math.floor(totalSecs / 60);
  const s = totalSecs % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function NodeCard({ node }: NodeCardProps) {
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
  const logsEndRef = useRef<HTMLDivElement>(null);

  const isThisNodeActive = activeNodeVrf === node.nombre_vrf && !!node.nombre_vrf;
  const isAnyNodeActive = !!activeNodeVrf;

  // Countdown timer
  useEffect(() => {
    if (!isThisNodeActive || !tunnelExpiry) {
      setCountdown('');
      return;
    }
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

  const addLog = (msg: string) =>
    setLogs((prev) => [...prev.slice(-8), msg]);

  const handleActivate = async () => {
    if (!credentials || !node.nombre_vrf) return;

    setIsActivating(true);
    setLogs([]);

    try {
      // Si hay otro nodo activo, primero desactivar
      if (isAnyNodeActive) {
        addLog('Revocando acceso anterior...');
        await deactivateAllNodes();
      }

      addLog(`Configurando VRF: ${node.nombre_vrf}`);
      addLog(`IP Admin: ${adminIP}`);

      // 20s: connect + 2x setScriptGlobalVar (fetch env vars + add/set) + script run
      const res = await fetchWithTimeout('http://localhost:3001/api/tunnel/activate', {
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
      if (!res.ok || !data.success) {
        throw new Error(data.message ?? 'Error activando tunnel');
      }

      addLog(`✓ Acceso abierto a ${node.nombre_vrf}`);
      addLog(`Red remota: ${node.segmento_lan || 'N/A'}`);
      setActiveNodeVrf(node.nombre_vrf);
      setTunnelExpiry(Date.now() + TUNNEL_TIMEOUT_MS);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      addLog(`✗ Error: ${msg}`);
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
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      addLog(`✗ Error: ${msg}`);
    } finally {
      setIsDeactivating(false);
    }
  };

  const isPending = isActivating || isDeactivating;
  const canActivate = !isPending && !!node.nombre_vrf && !node.disabled && node.running;

  // Motivo por el que el botón Acceder está deshabilitado (para tooltip)
  const accessBlockReason = !node.nombre_vrf
    ? 'Sin VRF asignado'
    : node.disabled
      ? 'Secret PPP deshabilitado'
      : !node.running
        ? 'Torre no conectada al VPN'
        : null;

  return (
    <div
      className={`card card-hover flex flex-col overflow-hidden transition-all duration-300
        ${isThisNodeActive ? 'ring-2 ring-emerald-400 ring-offset-2' : ''}
        ${isPending ? 'ring-2 ring-indigo-300 ring-offset-2' : ''}`}
    >
      {/* Progress bar top */}
      <div className="h-1 w-full bg-slate-100">
        <div
          className={`h-full transition-all duration-500 ease-out rounded-full
            ${isThisNodeActive ? 'bg-emerald-500' : isPending ? 'bg-indigo-500 animate-pulse' : 'bg-transparent'}`}
          style={{ width: isThisNodeActive ? '100%' : isPending ? '75%' : '0%' }}
        />
      </div>

      {/* Header */}
      <div
        className={`px-5 py-4 flex items-center justify-between border-b border-slate-100
          ${isThisNodeActive ? 'bg-emerald-50' : isPending ? 'bg-indigo-50' : 'bg-slate-50'}`}
      >
        <div className="flex items-center space-x-3 min-w-0">
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0
              ${isThisNodeActive
                ? 'bg-emerald-500 shadow-md shadow-emerald-500/30'
                : isPending
                  ? 'bg-indigo-500 shadow-md shadow-indigo-500/30'
                  : node.running
                    ? 'bg-sky-500 shadow-md shadow-sky-500/30'
                    : 'bg-slate-200'}`}
          >
            {isThisNodeActive ? (
              <Radio className="w-4 h-4 text-white animate-pulse" />
            ) : isPending ? (
              <Loader2 className="w-4 h-4 text-white animate-spin" />
            ) : node.running ? (
              <Wifi className="w-4 h-4 text-white" />
            ) : (
              <WifiOff className="w-4 h-4 text-slate-400" />
            )}
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-slate-800 truncate text-sm" title={node.nombre_nodo}>
              {node.nombre_nodo}
            </h3>
            <div className="flex items-center space-x-2 mt-0.5">
              <span
                className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-md
                  ${node.running && !node.disabled
                    ? 'bg-emerald-100 text-emerald-700'
                    : node.disabled
                      ? 'bg-rose-100 text-rose-600'
                      : 'bg-slate-100 text-slate-500'}`}
              >
                {node.disabled ? 'Deshabilitado' : node.running ? 'Conectado' : 'Desconectado'}
              </span>
              {isThisNodeActive && countdown && (
                <span className="text-[10px] font-bold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-md flex items-center space-x-1">
                  <Clock className="w-3 h-3" />
                  <span>{countdown}</span>
                </span>
              )}
            </div>
          </div>
        </div>

        {node.disabled && (
          <ShieldOff className="w-4 h-4 text-rose-300 shrink-0" />
        )}
      </div>

      {/* Info grid */}
      <div className="px-5 py-3 grid grid-cols-2 gap-3 border-b border-slate-100">
        <div className="bg-slate-50 rounded-xl p-2.5">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">VRF</p>
          <p className={`font-mono text-xs font-bold truncate ${node.nombre_vrf ? 'text-indigo-600' : 'text-slate-300'}`} title={node.nombre_vrf}>
            {node.nombre_vrf || '— Sin VRF'}
          </p>
        </div>
        <div className="bg-slate-50 rounded-xl p-2.5">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Red LAN</p>
          <p className={`font-mono text-xs font-bold ${node.segmento_lan ? 'text-sky-600' : 'text-slate-300'}`}>
            {node.segmento_lan || '— Sin ruta'}
          </p>
        </div>
        <div className="bg-slate-50 rounded-xl p-2.5">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">IP Túnel</p>
          <p className={`font-mono text-xs font-bold ${node.ip_tunnel ? 'text-emerald-600' : 'text-slate-300'}`}>
            {node.ip_tunnel || '—'}
          </p>
        </div>
        <div className="bg-slate-50 rounded-xl p-2.5">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Usuario PPP</p>
          <p className="font-mono text-xs font-bold text-slate-600 truncate" title={node.ppp_user}>
            {node.ppp_user}
          </p>
        </div>
      </div>

      {/* Terminal de logs */}
      <div className="mx-4 my-3 bg-slate-900 rounded-xl p-3 min-h-[72px] max-h-[96px] overflow-y-auto flex-grow">
        <div className="flex items-center space-x-1.5 mb-2">
          <Activity className="w-3 h-3 text-slate-500" />
          <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">Acceso</span>
          {isThisNodeActive && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse ml-auto" />}
        </div>
        <div className="console-text text-emerald-400 space-y-0.5">
          {logs.length === 0 && (
            <span className="text-slate-600 italic">Sin actividad</span>
          )}
          {logs.map((log, i) => (
            <div key={i} className={i === logs.length - 1 ? 'text-white' : 'text-slate-500'}>
              › {log}
            </div>
          ))}
          <div ref={logsEndRef} />
        </div>
      </div>

      {/* Motivo de bloqueo cuando el nodo no puede ser accedido */}
      {!canActivate && !isThisNodeActive && !isPending && accessBlockReason && (
        <div className="mx-4 mb-1 px-2.5 py-1.5 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-[10px] font-semibold text-amber-700">⚠ {accessBlockReason}</p>
        </div>
      )}

      {/* Botones */}
      <div className="px-4 pb-4 grid grid-cols-2 gap-2">
        <button
          disabled={!canActivate || isThisNodeActive}
          onClick={handleActivate}
          title={accessBlockReason ?? undefined}
          className={`py-2.5 px-3 rounded-xl font-bold text-sm flex items-center justify-center space-x-2 transition-all
            ${canActivate && !isThisNodeActive
              ? 'btn-primary'
              : 'bg-slate-100 text-slate-300 cursor-not-allowed'}`}
        >
          {isActivating ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Play className="w-4 h-4" />
          )}
          <span>{isActivating ? 'Abriendo...' : 'Acceder'}</span>
        </button>

        <button
          disabled={!isThisNodeActive || isPending}
          onClick={handleDeactivate}
          className={`py-2.5 px-3 rounded-xl font-bold text-sm flex items-center justify-center space-x-2 transition-all
            ${isThisNodeActive && !isPending
              ? 'bg-rose-500 hover:bg-rose-600 text-white shadow-md shadow-rose-500/25 active:scale-[0.98]'
              : 'bg-slate-100 text-slate-300 cursor-not-allowed'}`}
        >
          {isDeactivating ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <ShieldOff className="w-4 h-4" />
          )}
          <span>{isDeactivating ? 'Revocando...' : 'Revocar'}</span>
        </button>
      </div>
    </div>
  );
}
