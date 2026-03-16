import { useState, useEffect, useRef } from 'react';
import { Play, Square, Activity, Trash2, Loader2, Wifi, WifiOff, Clock } from 'lucide-react';
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
  onUpdate: (updated: VpnSecret) => void;
  onRemove: () => void;
}

export default function VpnCard({ vpn, onUpdate, onRemove }: VpnCardProps) {
  const { credentials } = useVpn();

  const [status, setStatus] = useState<'disabled' | 'activating' | 'running' | 'deleting'>(
    vpn.running ? 'running' : 'disabled',
  );
  const [progress, setProgress] = useState(vpn.running ? 100 : 0);
  const [logs, setLogs] = useState<string[]>(
    vpn.running ? [`Sincronizado · IP ${vpn.ip ?? 'en resolución'}`] : [],
  );
  const [uptime, setUptime] = useState(() =>
    vpn.running && vpn.uptime ? parseRouterUptime(vpn.uptime) : 0,
  );
  const [showConfirm, setShowConfirm] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (vpn.running && status !== 'running' && status !== 'activating') {
      setStatus('running');
      setProgress(100);
      setLogs([`Sincronizado · IP ${vpn.ip ?? 'en resolución'}`]);
      setUptime(vpn.uptime ? parseRouterUptime(vpn.uptime) : 0);
    } else if (!vpn.running && status === 'running') {
      setStatus('disabled');
      setProgress(0);
      setLogs(['Interfaz desactivada externamente']);
      setUptime(0);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vpn.running, vpn.ip, vpn.uptime, status]); // status incluido: evita stale closure durante activating

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  useEffect(() => {
    if (status !== 'running') return;
    const interval = setInterval(() => setUptime((prev) => prev + 1), 1000);
    return () => clearInterval(interval);
  }, [status]);

  const addLog = (msg: string) =>
    setLogs((prev) => [...prev.slice(-10), msg]);

  const handleActivate = async () => {
    if (!credentials) return;
    setStatus('activating');
    setProgress(0);
    setLogs([]);
    try {
      addLog('Enviando Enable → RouterOS API...');
      setProgress(30);
      // 20s: connect (hasta 8s) + 5 escrituras secuenciales en RouterOS sobre WireGuard
      const response = await fetchWithTimeout('http://localhost:3001/api/interface/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ip: credentials.ip,
          user: credentials.user,
          pass: credentials.pass,
          vpnId: vpn.id,
          vpnName: vpn.name,
          vpnService: vpn.service,
        }),
      }, 20_000);
      setProgress(70);
      const data: ActivateResponse = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message ?? 'Error activando interfaz');
      }
      setProgress(100);
      setStatus('running');
      addLog(`✓ Activo · IP ${data.ip ?? 'en negociación'}`);
      onUpdate({ ...vpn, disabled: false, running: true, ip: data.ip, uptime: undefined });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      addLog(`✗ Error: ${msg}`);
      setStatus('disabled');
      setProgress(0);
    }
  };

  const handleDeactivate = async () => {
    if (!credentials) return;
    setStatus('deleting');
    setProgress(50);
    try {
      addLog('Enviando Disable → RouterOS API...');
      const response = await fetchWithTimeout('http://localhost:3001/api/interface/deactivate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ip: credentials.ip,
          user: credentials.user,
          pass: credentials.pass,
          vpnId: vpn.id,
          vpnName: vpn.name,
          vpnService: vpn.service,
        }),
      }, 20_000);
      const data: DeactivateResponse = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message ?? 'Error desactivando interfaz');
      }
      setProgress(0);
      setStatus('disabled');
      addLog('✓ Secret deshabilitado');
      onUpdate({ ...vpn, disabled: true, running: false, ip: undefined, uptime: undefined });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      addLog(`✗ Error: ${msg}`);
      setStatus('running');
      setProgress(100);
    }
  };

  const isRunning = status === 'running';
  const isPending = status === 'activating' || status === 'deleting';

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

      <div className={`card card-hover flex flex-col overflow-hidden transition-all duration-300
        ${isRunning ? 'ring-2 ring-emerald-400 ring-offset-2' : ''}
        ${isPending ? 'ring-2 ring-indigo-300 ring-offset-2' : ''}`}
      >
        {/* Barra de progreso top */}
        <div className="h-1 w-full bg-slate-100">
          <div
            className={`h-full transition-all duration-500 ease-out rounded-full
              ${status === 'deleting' ? 'bg-rose-400' : 'bg-indigo-500'}`}
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Header */}
        <div className={`px-5 py-4 flex items-center justify-between border-b border-slate-100
          ${isRunning ? 'bg-emerald-50' : isPending ? 'bg-indigo-50' : 'bg-slate-50'}`}
        >
          <div className="flex items-center space-x-3 min-w-0">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0
              ${isRunning ? 'bg-emerald-500 shadow-md shadow-emerald-500/30'
                : isPending ? 'bg-indigo-500 shadow-md shadow-indigo-500/30'
                : 'bg-slate-200'}`}
            >
              {isRunning ? (
                <Wifi className="w-4 h-4 text-white" />
              ) : isPending ? (
                <Loader2 className="w-4 h-4 text-white animate-spin" />
              ) : (
                <WifiOff className="w-4 h-4 text-slate-400" />
              )}
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-slate-800 truncate text-sm" title={vpn.name}>
                {vpn.name}
              </h3>
              <div className="flex items-center space-x-2 mt-0.5">
                <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-md
                  ${vpn.service === 'sstp'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-violet-100 text-violet-700'}`}>
                  {vpn.service}
                </span>
                <span className="text-xs text-slate-400 truncate">{vpn.profile}</span>
              </div>
            </div>
          </div>

          {!isRunning && !isPending && (
            <button
              onClick={() => setShowConfirm(true)}
              className="p-1.5 text-slate-300 hover:text-rose-400 hover:bg-rose-50 rounded-lg transition-colors shrink-0"
              title="Quitar"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Stats */}
        <div className="px-5 py-3 grid grid-cols-2 gap-3 border-b border-slate-100">
          <div className="bg-slate-50 rounded-xl p-2.5">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">IP Asignada</p>
            <p className={`font-mono text-sm font-bold ${isRunning ? 'text-emerald-600' : 'text-slate-300'}`}>
              {vpn.ip ?? '—'}
            </p>
          </div>
          <div className="bg-slate-50 rounded-xl p-2.5">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1 flex items-center space-x-1">
              <Clock className="w-3 h-3" /><span>Uptime</span>
            </p>
            <p className={`font-mono text-sm font-bold ${isRunning ? 'text-indigo-600' : 'text-slate-300'}`}>
              {isRunning ? formatUptime(uptime) : '00:00:00'}
            </p>
          </div>
        </div>

        {/* Terminal de logs */}
        <div className="mx-4 my-3 bg-slate-900 rounded-xl p-3 min-h-[90px] max-h-[110px] overflow-y-auto flex-grow">
          <div className="flex items-center space-x-1.5 mb-2">
            <Activity className="w-3 h-3 text-slate-500" />
            <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">Logs</span>
            {isRunning && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse ml-auto" />}
          </div>
          <div className="console-text text-emerald-400 space-y-0.5">
            {logs.length === 0 && (
              <span className="text-slate-600 italic">Sin actividad reciente</span>
            )}
            {logs.map((log, i) => (
              <div key={i} className={i === logs.length - 1 ? 'text-white' : 'text-slate-500'}>
                › {log}
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        </div>

        {/* Botones */}
        <div className="px-4 pb-4 grid grid-cols-2 gap-2">
          <button
            disabled={status !== 'disabled'}
            onClick={handleActivate}
            className={`py-2.5 px-3 rounded-xl font-bold text-sm flex items-center justify-center space-x-2 transition-all
              ${status === 'disabled'
                ? 'btn-primary'
                : 'bg-slate-100 text-slate-300 cursor-not-allowed'}`}
          >
            {status === 'activating'
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Play className="w-4 h-4" />}
            <span>{status === 'activating' ? 'Activando' : 'Activar'}</span>
          </button>

          <button
            disabled={status !== 'running'}
            onClick={handleDeactivate}
            className={`py-2.5 px-3 rounded-xl font-bold text-sm flex items-center justify-center space-x-2 transition-all
              ${status === 'running'
                ? 'bg-rose-500 hover:bg-rose-600 text-white shadow-md shadow-rose-500/25 active:scale-[0.98]'
                : 'bg-slate-100 text-slate-300 cursor-not-allowed'}`}
          >
            {status === 'deleting'
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Square className="w-4 h-4" />}
            <span>{status === 'deleting' ? 'Deteniendo' : 'Desactivar'}</span>
          </button>
        </div>
      </div>
    </>
  );
}
