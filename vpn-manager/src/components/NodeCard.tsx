import { useState, useEffect, useRef } from 'react';
import { Play, ShieldOff, Wifi, WifiOff, Clock, Loader2, Radio } from 'lucide-react';
import { useVpn, TUNNEL_TIMEOUT_MS } from '../context/VpnContext';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';
import type { NodeInfo, TunnelActivateResponse } from '../types/api';

interface NodeCardProps {
  node: NodeInfo;
  rowIndex: number;
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return '00:00';
  const totalSecs = Math.floor(ms / 1000);
  const m = Math.floor(totalSecs / 60);
  const s = totalSecs % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function NodeCard({ node, rowIndex }: NodeCardProps) {
  const {
    credentials,
    activeNodeVrf,
    setActiveNodeVrf,
    tunnelExpiry,
    setTunnelExpiry,
    adminIP,
    deactivateAllNodes,
  } = useVpn();

  const [isActivating,   setIsActivating]   = useState(false);
  const [isDeactivating, setIsDeactivating] = useState(false);
  const [logs,           setLogs]           = useState<string[]>([]);
  const [countdown,      setCountdown]      = useState('');
  const logsEndRef = useRef<HTMLDivElement>(null);

  const isThisNodeActive = activeNodeVrf === node.nombre_vrf && !!node.nombre_vrf;
  const isAnyNodeActive  = !!activeNodeVrf;

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
      const res = await fetchWithTimeout('http://localhost:3001/api/tunnel/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ip:        credentials.ip,
          user:      credentials.user,
          pass:      credentials.pass,
          tunnelIP:  adminIP,
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

  const isPending  = isActivating || isDeactivating;
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
            <p className="font-semibold text-slate-800 text-xs leading-tight truncate max-w-[200px]" title={node.nombre_nodo}>
              {node.nombre_nodo}
            </p>
            <div className="flex items-center gap-1.5">
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
          <span className={`font-mono text-xs font-semibold ${node.segmento_lan ? 'text-sky-600' : 'text-slate-300'}`}>
            {node.segmento_lan || '—'}
          </span>
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
