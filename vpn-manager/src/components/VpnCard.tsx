import { useState, useEffect, useRef } from 'react';
import { Play, Square, Activity, Trash2, CheckCircle, Loader2, Cpu } from 'lucide-react';
import { useVpn } from '../context/VpnContext';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';
import type { VpnSecret } from '../store/db';
import type { ActivateResponse, DeactivateResponse } from '../types/api';
import ConfirmModal from './ConfirmModal';

// Convierte uptime de RouterOS ("2d3h50m14s") a segundos
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
    vpn.running ? [`> Sincronizado activo [${vpn.ip ?? 'IP en resolución...'}]`] : [],
  );
  const [uptime, setUptime] = useState(() =>
    vpn.running && vpn.uptime ? parseRouterUptime(vpn.uptime) : 0,
  );
  const [showConfirm, setShowConfirm] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Sincronizar estado UI cuando el prop cambia (polling externo)
  useEffect(() => {
    if (vpn.running && status !== 'running' && status !== 'activating') {
      setStatus('running');
      setProgress(100);
      setLogs([`> Sincronizado activo [${vpn.ip ?? 'IP en resolución...'}]`]);
      setUptime(vpn.uptime ? parseRouterUptime(vpn.uptime) : 0);
    } else if (!vpn.running && status === 'running') {
      setStatus('disabled');
      setProgress(0);
      setLogs(['> Interfaz inactiva (deshabilitada externamente)']);
      setUptime(0);
    }
  }, [vpn.running, vpn.ip, vpn.uptime]);

  // Auto-scroll de logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Contador de uptime local (incrementa desde el uptime real de RouterOS)
  useEffect(() => {
    if (status !== 'running') return;
    const interval = setInterval(() => setUptime((prev) => prev + 1), 1000);
    return () => clearInterval(interval);
  }, [status]);

  const addLog = (msg: string) =>
    setLogs((prev) => [...prev.slice(-10), `> ${msg}`]);

  const handleActivate = async () => {
    if (!credentials) return;
    setStatus('activating');
    setProgress(0);
    setLogs([]);
    try {
      addLog('Enviando petición RouterOS API Socket (Enable)');
      setProgress(30);
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
      });
      setProgress(70);
      const data: ActivateResponse = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message ?? 'Error activando interfaz');
      }
      setProgress(100);
      setStatus('running');
      addLog(`[OK] Interfaz corriendo. IP Asignada: ${data.ip ?? 'En negociación...'}`);
      onUpdate({ ...vpn, disabled: false, running: true, ip: data.ip, uptime: undefined });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      addLog(`[ERROR] Falló la activación: ${msg}`);
      setStatus('disabled');
      setProgress(0);
    }
  };

  const handleDeactivate = async () => {
    if (!credentials) return;
    setStatus('deleting');
    setProgress(50);
    try {
      addLog('Enviando petición RouterOS API Socket (Disable & Remove)');
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
      });
      const data: DeactivateResponse = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message ?? 'Error desactivando interfaz');
      }
      setProgress(0);
      setStatus('disabled');
      addLog('[OK] Secret deshabilitado.');
      onUpdate({ ...vpn, disabled: true, running: false, ip: undefined, uptime: undefined });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      addLog(`[ERROR] Falló la desactivación: ${msg}`);
      setStatus('running');
      setProgress(100);
    }
  };

  const isRunning = status === 'running';
  const isPending = status === 'activating' || status === 'deleting';

  const cardBorder = isRunning
    ? 'border-emerald-500'
    : isPending
      ? 'border-indigo-400'
      : 'border-slate-300 dark:border-slate-800';

  const headerBg = isRunning
    ? 'bg-emerald-500/10'
    : isPending
      ? 'bg-indigo-500/10 animate-pulse'
      : 'bg-slate-100 dark:bg-slate-800/50';

  return (
    <>
      <ConfirmModal
        isOpen={showConfirm}
        title="Quitar interfaz de gestión"
        message={`¿Seguro que deseas quitar "${vpn.name}" del panel? No afecta la configuración del router.`}
        confirmLabel="Quitar"
        onConfirm={() => {
          setShowConfirm(false);
          onRemove();
        }}
        onCancel={() => setShowConfirm(false)}
      />

      <div
        className={`glassmorphism dark:glassmorphism-dark rounded-3xl overflow-hidden border-2 transition-all duration-500 flex flex-col
          ${status === 'disabled' ? 'grayscale-[0.4] opacity-90' : 'shadow-xl'}
          ${cardBorder}`}
      >
        {/* Header */}
        <div className={`p-4 flex items-center justify-between ${headerBg} border-b border-inherit`}>
          <div className="flex items-center space-x-3 w-full pr-2">
            {isRunning ? (
              <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
                <CheckCircle className="w-5 h-5 text-emerald-500" />
              </div>
            ) : (
              <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center shrink-0">
                <Cpu
                  className={`w-5 h-5 text-slate-500 dark:text-slate-400 ${isPending ? 'animate-spin' : ''}`}
                />
              </div>
            )}
            <div className="w-full min-w-0">
              <h3
                className="font-bold text-lg truncate text-slate-800 dark:text-slate-100 leading-tight"
                title={vpn.name}
              >
                {vpn.name}
              </h3>
              <div className="flex items-center space-x-2 mt-1">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 bg-white/50 dark:bg-black/20 px-2 rounded">
                  {vpn.service}
                </span>
                <span className="text-xs text-slate-500 truncate" title={vpn.profile}>
                  {vpn.profile}
                </span>
              </div>
            </div>
          </div>

          {!isRunning && !isPending && (
            <button
              onClick={() => setShowConfirm(true)}
              className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-full transition-colors shrink-0"
              title="Quitar interfaz de gestión"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Barra de progreso */}
        <div className="h-1 w-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ease-out ${status === 'deleting' ? 'bg-rose-500' : 'bg-indigo-500'}`}
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="p-5 flex-grow flex flex-col">
          {/* Terminal de logs */}
          <div className="bg-slate-950 rounded-2xl p-3 flex-grow min-h-[140px] max-h-[180px] overflow-y-auto mb-4 border border-slate-800 shadow-inner">
            <div className="sticky top-0 bg-slate-950/90 pb-2 mb-2 border-b border-slate-800/80 backdrop-blur-sm z-10 flex justify-between items-center">
              <span className="text-[10px] text-slate-500 font-bold tracking-widest uppercase flex items-center">
                <Activity className="w-3 h-3 mr-1" />
                RouterOS Logs
              </span>
              {isRunning && <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />}
            </div>
            <div className="space-y-1 console-text text-emerald-400">
              {logs.map((log, i) => (
                <div
                  key={i}
                  className={i === logs.length - 1 ? 'font-bold text-white' : 'opacity-60'}
                >
                  {log}
                </div>
              ))}
              <div ref={logsEndRef} className="h-1" />
            </div>
          </div>

          {/* Monitor en tiempo real */}
          <div className="grid grid-cols-2 gap-3 mb-5">
            <div
              className={`rounded-2xl p-3 border ${isRunning ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-slate-100 dark:bg-slate-800/50 border-transparent'}`}
            >
              <span className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                Assigned IP
              </span>
              <span className="font-mono text-sm font-bold text-slate-700 dark:text-slate-300">
                {vpn.ip ?? '---.---.---.---'}
              </span>
            </div>
            <div
              className={`rounded-2xl p-3 border ${isRunning ? 'bg-indigo-500/5 border-indigo-500/20' : 'bg-slate-100 dark:bg-slate-800/50 border-transparent'}`}
            >
              <span className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                Uptime
              </span>
              <span className="font-mono text-sm font-bold text-slate-700 dark:text-slate-300">
                {isRunning ? formatUptime(uptime) : '00:00:00'}
              </span>
            </div>
          </div>

          {/* Botones de acción */}
          <div className="mt-auto pt-2 grid grid-cols-2 gap-3">
            <button
              disabled={status !== 'disabled'}
              onClick={handleActivate}
              className={`py-3 px-4 rounded-2xl font-bold flex items-center justify-center space-x-2 transition-all
                ${status === 'disabled'
                  ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/30'
                  : 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed'}`}
            >
              {status === 'activating' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              <span>{status === 'activating' ? 'ACTIVANDO...' : 'ACTIVAR'}</span>
            </button>

            <button
              disabled={status !== 'running'}
              onClick={handleDeactivate}
              className={`py-3 px-4 rounded-2xl font-bold flex items-center justify-center space-x-2 transition-all
                ${status === 'running'
                  ? 'bg-rose-500 hover:bg-rose-400 text-white shadow-lg shadow-rose-500/30'
                  : 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed'}`}
            >
              {status === 'deleting' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Square className="w-4 h-4" />
              )}
              <span className="text-sm">{status === 'deleting' ? 'DETENIENDO...' : 'DESACTIVAR'}</span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
