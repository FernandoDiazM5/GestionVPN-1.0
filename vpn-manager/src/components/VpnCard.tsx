import { useState, useEffect, useRef } from 'react';
import { Play, Square, Trash2, Loader2, Wifi, WifiOff, Clock } from 'lucide-react';
import { useVpn } from '../context/VpnContext';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';
import type { VpnSecret } from '../store/db';
import type { ActivateResponse, DeactivateResponse } from '../types/api';
import ConfirmModal from './ConfirmModal';

function parseRouterUptime(uptime: string): number {
  let total = 0;
  const d = uptime.match(/(\d+)d/);
  const h = uptime.match(/(\d+)h/);
  const m = uptime.match(/(\d+)m/);
  const s = uptime.match(/(\d+)s/);
  if (d) total += parseInt(d[1]) * 86400;
  if (h) total += parseInt(h[1]) * 3600;
  if (m) total += parseInt(m[1]) * 60;
  if (s) total += parseInt(s[1]);
  return total;
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

interface VpnCardProps {
  vpn: VpnSecret;
  rowIndex: number;
  onUpdate: (updated: VpnSecret) => void;
  onRemove: () => void;
}

export default function VpnCard({ vpn, rowIndex, onUpdate, onRemove }: VpnCardProps) {
  const { credentials } = useVpn();

  const [status,      setStatus]      = useState<'disabled' | 'activating' | 'running' | 'deleting'>(
    vpn.running ? 'running' : 'disabled',
  );
  const [logs,        setLogs]        = useState<string[]>(
    vpn.running ? [`Sincronizado · IP ${vpn.ip ?? 'en resolución'}`] : [],
  );
  const [uptime,      setUptime]      = useState(() =>
    vpn.running && vpn.uptime ? parseRouterUptime(vpn.uptime) : 0,
  );
  const [showConfirm, setShowConfirm] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (vpn.running && status !== 'running' && status !== 'activating') {
      setStatus('running');

      setLogs([`Sincronizado · IP ${vpn.ip ?? 'en resolución'}`]);
      setUptime(vpn.uptime ? parseRouterUptime(vpn.uptime) : 0);
    } else if (!vpn.running && status === 'running') {
      setStatus('disabled');

      setLogs(['Interfaz desactivada externamente']);
      setUptime(0);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vpn.running, vpn.ip, vpn.uptime, status]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  useEffect(() => {
    if (status !== 'running') return;
    const interval = setInterval(() => setUptime(prev => prev + 1), 1000);
    return () => clearInterval(interval);
  }, [status]);

  const addLog = (msg: string) => setLogs(prev => [...prev.slice(-10), msg]);

  const handleActivate = async () => {
    if (!credentials) return;
    setStatus('activating');
    setLogs([]);
    try {
      addLog('Enviando Enable → RouterOS API...');

      const response = await fetchWithTimeout('http://localhost:3001/api/interface/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ip: credentials.ip, user: credentials.user, pass: credentials.pass,
          vpnId: vpn.id, vpnName: vpn.name, vpnService: vpn.service,
        }),
      }, 20_000);

      const data: ActivateResponse = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message ?? 'Error activando interfaz');

      setStatus('running');
      addLog(`✓ Activo · IP ${data.ip ?? 'en negociación'}`);
      onUpdate({ ...vpn, disabled: false, running: true, ip: data.ip, uptime: undefined });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      addLog(`✗ Error: ${msg}`);
      setStatus('disabled');

    }
  };

  const handleDeactivate = async () => {
    if (!credentials) return;
    setStatus('deleting');
    try {
      addLog('Enviando Disable → RouterOS API...');
      const response = await fetchWithTimeout('http://localhost:3001/api/interface/deactivate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ip: credentials.ip, user: credentials.user, pass: credentials.pass,
          vpnId: vpn.id, vpnName: vpn.name, vpnService: vpn.service,
        }),
      }, 20_000);
      const data: DeactivateResponse = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message ?? 'Error desactivando interfaz');

      setStatus('disabled');
      addLog('✓ Secret deshabilitado');
      onUpdate({ ...vpn, disabled: true, running: false, ip: undefined, uptime: undefined });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      addLog(`✗ Error: ${msg}`);
      setStatus('running');

    }
  };

  const isRunning  = status === 'running';
  const isPending  = status === 'activating' || status === 'deleting';
  const showLogs   = logs.length > 0 || isPending;

  const rowBg = isRunning
    ? 'bg-emerald-50/60'
    : isPending
      ? 'bg-indigo-50/60'
      : rowIndex % 2 === 0
        ? 'bg-white'
        : 'bg-slate-50/40';

  const borderLeft = isRunning
    ? 'border-l-2 border-l-emerald-400'
    : isPending
      ? 'border-l-2 border-l-indigo-400'
      : 'border-l-2 border-l-transparent';

  return (
    <>
      <ConfirmModal
        isOpen={showConfirm}
        title="Quitar de gestión"
        message={`¿Quitar "${vpn.name}" del panel? No afecta la configuración del router.`}
        confirmLabel="Quitar"
        onConfirm={() => { setShowConfirm(false); onRemove(); }}
        onCancel={() => setShowConfirm(false)}
      />

      {/* ── Fila principal ── */}
      <tr className={`${rowBg} ${borderLeft} transition-colors hover:bg-indigo-50/30`}>

        {/* Estado */}
        <td className="px-4 py-3 w-10">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0
            ${isRunning
              ? 'bg-emerald-500 shadow-sm shadow-emerald-500/40'
              : isPending
                ? 'bg-indigo-500 shadow-sm shadow-indigo-500/40'
                : 'bg-slate-200'}`}
          >
            {isRunning ? (
              <Wifi className="w-3.5 h-3.5 text-white" />
            ) : isPending ? (
              <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />
            ) : (
              <WifiOff className="w-3.5 h-3.5 text-slate-400" />
            )}
          </div>
        </td>

        {/* Nombre */}
        <td className="px-4 py-3 min-w-[160px]">
          <p className="font-semibold text-slate-800 text-xs truncate max-w-[220px]" title={vpn.name}>
            {vpn.name}
          </p>
        </td>

        {/* Servicio */}
        <td className="px-4 py-3">
          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-md
            ${vpn.service === 'sstp'
              ? 'bg-blue-100 text-blue-700'
              : 'bg-violet-100 text-violet-700'}`}>
            {vpn.service}
          </span>
        </td>

        {/* Perfil */}
        <td className="px-4 py-3">
          <span className="text-xs text-slate-500 truncate block max-w-[120px]" title={vpn.profile}>
            {vpn.profile || '—'}
          </span>
        </td>

        {/* IP Asignada */}
        <td className="px-4 py-3">
          <span className={`font-mono text-xs font-semibold ${isRunning ? 'text-emerald-600' : 'text-slate-300'}`}>
            {vpn.ip ?? '—'}
          </span>
        </td>

        {/* Uptime */}
        <td className="px-4 py-3">
          <span className={`font-mono text-xs font-semibold flex items-center gap-1
            ${isRunning ? 'text-indigo-600' : 'text-slate-300'}`}>
            <Clock className="w-3 h-3 opacity-60" />
            {isRunning ? formatUptime(uptime) : '—'}
          </span>
        </td>

        {/* Acciones */}
        <td className="px-4 py-3">
          <div className="flex items-center justify-end gap-2">
            <button
              disabled={status !== 'disabled'}
              onClick={handleActivate}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all
                ${status === 'disabled'
                  ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm shadow-indigo-500/25 active:scale-[0.97]'
                  : 'bg-slate-100 text-slate-300 cursor-not-allowed'}`}
            >
              {status === 'activating'
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Play className="w-3.5 h-3.5" />}
              <span>{status === 'activating' ? 'Activando' : 'Activar'}</span>
            </button>

            <button
              disabled={status !== 'running'}
              onClick={handleDeactivate}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all
                ${status === 'running'
                  ? 'bg-rose-500 hover:bg-rose-600 text-white shadow-sm shadow-rose-500/25 active:scale-[0.97]'
                  : 'bg-slate-100 text-slate-300 cursor-not-allowed'}`}
            >
              {status === 'deleting'
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Square className="w-3.5 h-3.5" />}
              <span>{status === 'deleting' ? 'Deteniendo' : 'Desactivar'}</span>
            </button>

            {!isRunning && !isPending && (
              <button
                onClick={() => setShowConfirm(true)}
                className="p-1.5 text-slate-300 hover:text-rose-400 hover:bg-rose-50 rounded-lg transition-colors"
                title="Quitar"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </td>
      </tr>

      {/* ── Fila expandida: logs ── */}
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
