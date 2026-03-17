import { useState } from 'react';
import {
  Radio, Router, Signal, Trash2, RefreshCw, Loader2,
  ExternalLink, Activity, ArrowUp, ArrowDown, Zap, Waves,
  Gauge, MonitorSpeaker,
} from 'lucide-react';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';
import type { SavedDevice, AntennaStats } from '../types/devices';

interface DeviceCardProps {
  device: SavedDevice;
  onRemove: () => void;
  onUpdate: (updated: SavedDevice) => void;
}

// ── Barra de progreso genérica ──────────────────────────────────────────
function ProgressBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="w-full h-1.5 bg-white/30 rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ── Stat box pequeño ────────────────────────────────────────────────────
function StatBox({ label, value, unit = '', icon }: {
  label: string; value?: number | string | null; unit?: string; icon?: React.ReactNode;
}) {
  const hasValue = value !== undefined && value !== null && value !== '';
  return (
    <div className="bg-slate-800/60 rounded-xl p-3 space-y-1">
      <div className="flex items-center space-x-1.5">
        {icon && <span className="text-slate-400">{icon}</span>}
        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{label}</p>
      </div>
      <p className={`font-mono text-sm font-bold ${hasValue ? 'text-white' : 'text-slate-600'}`}>
        {hasValue ? `${value}${unit}` : '—'}
      </p>
    </div>
  );
}

// ── Calidad de señal ─────────────────────────────────────────────────────
function signalQuality(dbm: number | null | undefined): { label: string; color: string; bg: string; pct: number } {
  if (dbm === null || dbm === undefined) return { label: '—', color: 'bg-slate-500', bg: 'from-slate-700 to-slate-800', pct: 0 };
  const pct = Math.max(0, Math.min(100, ((dbm - (-95)) / ((-40) - (-95))) * 100));
  if (dbm >= -65) return { label: 'Excelente', color: 'bg-emerald-400',  bg: 'from-emerald-900 to-emerald-800', pct };
  if (dbm >= -75) return { label: 'Buena',     color: 'bg-sky-400',      bg: 'from-sky-900 to-sky-800',        pct };
  if (dbm >= -85) return { label: 'Regular',   color: 'bg-amber-400',    bg: 'from-amber-900 to-amber-800',    pct };
  return             { label: 'Mala',       color: 'bg-rose-400',     bg: 'from-rose-900 to-rose-800',      pct };
}

function ccqColor(ccq: number | null | undefined) {
  if (!ccq) return 'bg-slate-500';
  if (ccq >= 80) return 'bg-emerald-400';
  if (ccq >= 50) return 'bg-amber-400';
  return 'bg-rose-400';
}

// ───────────────────────────────────────────────────────────────────────
export default function DeviceCard({ device, onRemove, onUpdate }: DeviceCardProps) {
  const [activeTab, setActiveTab] = useState<'antenna' | 'router'>('antenna');

  const [antennaStats,     setAntennaStats]     = useState<AntennaStats | null>(null);
  const [isLoadingAntenna, setIsLoadingAntenna] = useState(false);
  const [antennaError,     setAntennaError]     = useState('');

  const handleLoadAntenna = async () => {
    if (!device.sshUser || !device.sshPass) {
      setAntennaError('Sin credenciales SSH — edita el dispositivo para agregarlas');
      return;
    }
    setIsLoadingAntenna(true);
    setAntennaError('');
    try {
      const res = await fetchWithTimeout('http://localhost:3001/api/device/antenna', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceIP:   device.ip,
          deviceUser: device.sshUser,
          devicePass: device.sshPass,
          devicePort: device.sshPort ?? 22,
        }),
      }, 20_000);
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message ?? 'Error obteniendo stats');
      setAntennaStats(data.stats);
      onUpdate({ ...device, lastSeen: Date.now() });
    } catch (err: unknown) {
      setAntennaError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setIsLoadingAntenna(false);
    }
  };

  const roleLabel = device.role === 'ap' ? 'AP' : device.role === 'sta' ? 'CPE' : '?';
  const roleGrad  = device.role === 'ap'
    ? 'from-indigo-500 to-indigo-600'
    : 'from-violet-500 to-violet-600';

  const sig = signalQuality(antennaStats?.signal);

  return (
    <div className="rounded-2xl overflow-hidden border border-slate-200 shadow-sm flex flex-col bg-white">

      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className={`bg-gradient-to-r ${roleGrad} px-4 py-3 flex items-center justify-between`}>
        <div className="flex items-center space-x-3 min-w-0">
          <div className="w-9 h-9 bg-white/20 backdrop-blur rounded-xl flex items-center justify-center shrink-0">
            {device.role === 'ap'
              ? <Radio  className="w-4.5 h-4.5 text-white" />
              : <Signal className="w-4.5 h-4.5 text-white" />}
          </div>
          <div className="min-w-0">
            <div className="flex items-center space-x-2">
              <h3 className="font-bold text-white text-sm truncate">{device.name}</h3>
              <span className="text-[9px] font-bold bg-white/20 text-white px-1.5 py-0.5 rounded-md shrink-0">
                {roleLabel}
              </span>
            </div>
            <p className="text-[10px] text-white/70 font-mono truncate">{device.model} · {device.firmware}</p>
          </div>
        </div>
        <button
          onClick={onRemove}
          className="p-1.5 text-white/50 hover:text-white hover:bg-white/20 rounded-lg transition-colors shrink-0"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* ── Info strip ──────────────────────────────────────────────── */}
      <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
        <span className="font-mono font-semibold text-slate-600">{device.ip}</span>
        {device.mac && <span className="font-mono text-slate-400">{device.mac}</span>}
        <span className="text-indigo-600 font-semibold">{device.nodeName}</span>
        {device.frequency
          ? <span className={`font-bold ${device.frequency >= 5000 ? 'text-sky-600' : 'text-amber-600'}`}>
              {(device.frequency / 1000).toFixed(1)} GHz
            </span>
          : null}
      </div>

      {/* ── Tabs ────────────────────────────────────────────────────── */}
      <div className="flex border-b border-slate-100">
        {(['antenna', 'router'] as const).map(tab => (
          <button key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2.5 text-xs font-bold flex items-center justify-center space-x-1.5 transition-colors
              ${activeTab === tab
                ? 'text-indigo-600 border-b-2 border-indigo-500 bg-indigo-50/60'
                : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
          >
            {tab === 'antenna'
              ? <><MonitorSpeaker className="w-3.5 h-3.5" /><span>Antena</span></>
              : <><Router className="w-3.5 h-3.5" /><span>Router</span></>}
          </button>
        ))}
      </div>

      {/* ── ANTENA TAB ──────────────────────────────────────────────── */}
      {activeTab === 'antenna' && (
        <div className="flex-1 bg-slate-900">

          {/* Botón actualizar */}
          <div className="p-4 pb-2">
            <button
              onClick={handleLoadAntenna}
              disabled={isLoadingAntenna}
              className="w-full flex items-center justify-center space-x-2 py-2.5 rounded-xl text-xs font-bold
                bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 transition-all active:scale-[0.98]"
            >
              {isLoadingAntenna
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /><span>Conectando SSH...</span></>
                : <><RefreshCw className="w-3.5 h-3.5" /><span>{antennaStats ? 'Actualizar' : 'Leer stats'}</span></>}
            </button>
          </div>

          {antennaError && (
            <div className="mx-4 mb-3 px-3 py-2 bg-rose-900/50 border border-rose-700 rounded-xl">
              <p className="text-[11px] text-rose-300">{antennaError}</p>
            </div>
          )}

          {/* Estado vacío */}
          {!antennaStats && !isLoadingAntenna && !antennaError && (
            <div className="px-4 pb-6 pt-2 flex flex-col items-center text-center space-y-2">
              <Waves className="w-8 h-8 text-slate-700 mt-2" />
              <p className="text-slate-500 text-xs">Presiona "Leer stats" para conectar via SSH</p>
            </div>
          )}

          {/* ── Stats ── */}
          {antennaStats && !antennaStats.raw && (
            <div className="px-4 pb-4 space-y-3">

              {/* Señal — bloque principal */}
              {antennaStats.signal !== null && antennaStats.signal !== undefined && (
                <div className={`bg-gradient-to-br ${sig.bg} rounded-2xl p-4`}>
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="text-[10px] font-bold text-white/50 uppercase tracking-wider mb-0.5">Señal RF</p>
                      <div className="flex items-end space-x-1.5">
                        <span className="text-4xl font-black text-white leading-none">{antennaStats.signal}</span>
                        <span className="text-sm text-white/60 font-mono mb-1">dBm</span>
                      </div>
                    </div>
                    <span className={`text-[11px] font-bold px-2.5 py-1 rounded-lg ${sig.color} text-slate-900`}>
                      {sig.label}
                    </span>
                  </div>
                  <ProgressBar pct={sig.pct} color="bg-white/70" />
                  {antennaStats.noiseFloor !== null && antennaStats.noiseFloor !== undefined && (
                    <p className="text-[10px] text-white/40 mt-1.5 font-mono">
                      Piso de ruido: {antennaStats.noiseFloor} dBm
                      {' · '}SNR: {(antennaStats.signal - antennaStats.noiseFloor).toFixed(0)} dB
                    </p>
                  )}
                </div>
              )}

              {/* CCQ */}
              {antennaStats.ccq !== null && antennaStats.ccq !== undefined && (
                <div className="bg-slate-800/60 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-1.5">
                      <Gauge className="w-3.5 h-3.5 text-slate-400" />
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">CCQ</span>
                    </div>
                    <span className="font-mono text-lg font-black text-white">{antennaStats.ccq}%</span>
                  </div>
                  <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${ccqColor(antennaStats.ccq)}`}
                      style={{ width: `${antennaStats.ccq}%` }}
                    />
                  </div>
                </div>
              )}

              {/* TX / RX */}
              {(antennaStats.txRate || antennaStats.rxRate) && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-slate-800/60 rounded-xl p-3">
                    <div className="flex items-center space-x-1.5 mb-1">
                      <ArrowUp className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">TX Rate</span>
                    </div>
                    <p className="font-mono text-xl font-black text-emerald-400">
                      {antennaStats.txRate ?? '—'}
                      <span className="text-xs text-slate-500 ml-1">Mbps</span>
                    </p>
                  </div>
                  <div className="bg-slate-800/60 rounded-xl p-3">
                    <div className="flex items-center space-x-1.5 mb-1">
                      <ArrowDown className="w-3.5 h-3.5 text-sky-400" />
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">RX Rate</span>
                    </div>
                    <p className="font-mono text-xl font-black text-sky-400">
                      {antennaStats.rxRate ?? '—'}
                      <span className="text-xs text-slate-500 ml-1">Mbps</span>
                    </p>
                  </div>
                </div>
              )}

              {/* Grid de parámetros */}
              <div className="grid grid-cols-3 gap-2">
                <StatBox label="TX Power" value={antennaStats.txPower}   unit=" dBm" icon={<Zap className="w-3 h-3" />} />
                <StatBox label="Frec."    value={antennaStats.frequency} unit=" MHz" icon={<Waves className="w-3 h-3" />} />
                <StatBox label="Distancia" value={antennaStats.distance} unit=" m"  icon={<Signal className="w-3 h-3" />} />
              </div>

              {/* ESSID / modo */}
              {(antennaStats.essid || antennaStats.mode) && (
                <div className="bg-slate-800/60 rounded-xl px-3 py-2 flex items-center justify-between text-[11px]">
                  {antennaStats.essid && (
                    <span className="font-mono text-indigo-300 font-semibold truncate">{antennaStats.essid}</span>
                  )}
                  {antennaStats.mode && (
                    <span className="text-slate-400 shrink-0 ml-2 uppercase text-[10px] font-bold">
                      {antennaStats.mode}
                    </span>
                  )}
                </div>
              )}

              {/* AirMax */}
              {antennaStats.airmaxEnabled !== undefined && (
                <div className="bg-slate-800/60 rounded-xl px-3 py-2 flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">AirMax</span>
                  <div className="flex items-center space-x-3">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md
                      ${antennaStats.airmaxEnabled ? 'bg-emerald-900 text-emerald-400' : 'bg-slate-700 text-slate-500'}`}>
                      {antennaStats.airmaxEnabled ? 'Activo' : 'Inactivo'}
                    </span>
                    {antennaStats.airmaxCapacity != null && (
                      <span className="text-[10px] font-mono text-slate-400">Cap {antennaStats.airmaxCapacity}%</span>
                    )}
                    {antennaStats.airmaxQuality != null && (
                      <span className="text-[10px] font-mono text-slate-400">Q {antennaStats.airmaxQuality}%</span>
                    )}
                  </div>
                </div>
              )}

              {/* Estaciones (modo AP) */}
              {antennaStats.stations && antennaStats.stations.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center space-x-1.5">
                    <Activity className="w-3 h-3" />
                    <span>Estaciones conectadas ({antennaStats.stations.length})</span>
                  </p>
                  <div className="rounded-xl overflow-hidden border border-slate-700">
                    {antennaStats.stations.map((sta, i) => (
                      <div key={i}
                        className={`flex items-center justify-between px-3 py-2.5 text-[11px]
                          ${i % 2 === 0 ? 'bg-slate-800/80' : 'bg-slate-800/40'}`}
                      >
                        <span className="font-mono text-emerald-400 text-[10px]">{sta.mac}</span>
                        <div className="flex items-center space-x-3 text-slate-300 font-mono">
                          <span>{sta.signal ?? '—'} dBm</span>
                          <span>{sta.ccq ?? '—'}%</span>
                          <span className="text-emerald-400">{sta.txRate ?? '—'}↑</span>
                          <span className="text-sky-400">{sta.rxRate ?? '—'}↓</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Fallback raw — texto formateado */}
          {antennaStats?.raw && (
            <div className="mx-4 mb-4">
              <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                Output SSH (formato no reconocido)
              </p>
              <div className="bg-slate-800 rounded-xl overflow-hidden border border-slate-700">
                {antennaStats.raw.split('\n').filter(Boolean).map((line, i) => {
                  const [k, ...vs] = line.split('=');
                  const v = vs.join('=');
                  return (
                    <div key={i} className={`flex items-center justify-between px-3 py-1.5 text-[11px]
                      ${i % 2 === 0 ? 'bg-slate-800/80' : 'bg-slate-800/40'}`}>
                      <span className="font-mono text-slate-400">{k.trim()}</span>
                      <span className="font-mono text-emerald-400 font-semibold">{v?.trim() ?? ''}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── ROUTER TAB ──────────────────────────────────────────────── */}
      {activeTab === 'router' && (
        <div className="p-4 space-y-3 flex-1">
          <a
            href={`http://${device.routerIp || device.ip}:${device.routerPort ?? 8075}`}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-center space-x-2 py-2.5 px-3 rounded-xl text-xs font-bold
              bg-slate-800 text-white hover:bg-slate-700 transition-all active:scale-[0.98]"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Abrir interfaz web :{device.routerPort ?? 8075}</span>
          </a>
          <div className="space-y-1 text-[11px] px-1">
            <div className="flex justify-between">
              <span className="text-slate-400">IP</span>
              <span className="font-mono text-slate-600">{device.routerIp || device.ip}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Puerto</span>
              <span className="font-mono text-slate-600">{device.routerPort ?? 8075}</span>
            </div>
            {device.routerUser && (
              <div className="flex justify-between">
                <span className="text-slate-400">Usuario</span>
                <span className="font-mono text-slate-600">{device.routerUser}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
