import { useState } from 'react';
import {
  Radio, Signal, Trash2, RefreshCw, Loader2,
  Activity, ArrowUp, ArrowDown, Waves,
  Cpu, Clock, Wifi,
  Info,
} from 'lucide-react';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';
import type { SavedDevice, AntennaStats } from '../types/devices';
import { API_BASE_URL } from '../config';

interface DeviceCardProps {
  device: SavedDevice;
  onRemove?: () => void;
  onUpdate?: (updated: SavedDevice) => void;
  isPreview?: boolean;
}

// ── Gauge circular SVG ───────────────────────────────────────────────────
function GaugeChart({ value, label, color }: { value: number | null | undefined; label: string; color: string }) {
  const pct = Math.max(0, Math.min(100, value ?? 0));
  const r = 26;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  // Colores semánticos: Rojo (>85%), Amarillo (>65%), Color base (<65%)
  const strokeColor = pct > 85 ? '#ef4444' : pct > 65 ? '#f59e0b' : color;
  // Efecto de resplandor para paneles oscuros
  const dropShadow = `drop-shadow(0px 0px 4px ${strokeColor}80)`;

  return (
    <div className="flex flex-col items-center space-y-1">
      <svg width="76" height="76" viewBox="0 0 76 76" className="overflow-visible">
        <circle cx="38" cy="38" r={r} fill="none" stroke="#1e293b" strokeWidth="6" />
        <circle
          cx="38" cy="38" r={r} fill="none"
          stroke={value != null ? strokeColor : '#334155'}
          strokeWidth="6"
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeLinecap="round"
          transform="rotate(-90 38 38)"
          style={{ transition: 'stroke-dasharray 1s cubic-bezier(0.4, 0, 0.2, 1)', filter: value != null ? dropShadow : 'none' }}
        />
        <text x="38" y="43" textAnchor="middle"
          style={{ fill: '#f8fafc', fontSize: '14px', fontWeight: '700', fontFamily: 'monospace', letterSpacing: '-0.5px' }}>
          {value != null ? `${pct}%` : '—'}
        </text>
      </svg>
      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">{label}</p>
    </div>
  );
}

// ── Barra de progreso ────────────────────────────────────────────────────
function Bar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="w-full h-2 bg-black/40 rounded-full overflow-hidden shadow-inner">
      <div className={`h-full rounded-full ${color} shadow-[0_0_8px_currentColor]`}
        style={{ width: `${pct}%`, transition: 'width 1s cubic-bezier(0.4, 0, 0.2, 1)' }} />
    </div>
  );
}

// ── Fila de parámetro ────────────────────────────────────────────────────
function ParamRow({ label, value }: { label: string; value?: string | number | null }) {
  if (value == null || value === '') return null;
  return (
    <div className="flex items-start justify-between gap-2 py-2 px-1 border-b border-slate-700/30 last:border-0 hover:bg-slate-800/40 transition-colors rounded-sm">
      <span className="text-[11px] text-slate-400 font-medium shrink-0">{label}</span>
      <span className="text-xs font-mono font-semibold text-slate-200 text-right break-all">{value}</span>
    </div>
  );
}

// ── Calidad de señal ─────────────────────────────────────────────────────
function signalMeta(dbm: number | null | undefined) {
  if (dbm == null) return { label: '—', color: 'bg-slate-500', grad: 'from-slate-800 to-slate-900', pct: 0 };
  const pct = Math.max(0, Math.min(100, ((dbm - (-95)) / ((-40) - (-95))) * 100));
  if (dbm >= -65) return { label: 'Excelente', color: 'bg-emerald-400', grad: 'from-emerald-950 to-emerald-900', pct };
  if (dbm >= -75) return { label: 'Buena', color: 'bg-sky-400', grad: 'from-sky-950 to-sky-900', pct };
  if (dbm >= -85) return { label: 'Regular', color: 'bg-amber-400', grad: 'from-amber-950 to-amber-900', pct };
  return { label: 'Mala', color: 'bg-rose-400', grad: 'from-rose-950 to-rose-900', pct };
}

function ccqColor(v?: number | null) {
  if (!v) return 'bg-slate-500';
  return v >= 80 ? 'bg-emerald-400' : v >= 50 ? 'bg-amber-400' : 'bg-rose-400';
}

function fmtSecurity(s?: string | null) {
  if (!s) return null;
  const map: Record<string, string> = {
    wpa2aes: 'WPA2-AES', wpa2: 'WPA2', wpa: 'WPA', none: 'Abierta', open: 'Abierta',
  };
  return map[s.toLowerCase()] ?? s.toUpperCase();
}

function fmtMode(m?: string | null) {
  if (!m) return null;
  return m === 'sta' ? 'Estación' : m === 'ap' || m === 'master' ? 'Punto de Acceso' : m;
}

function fmtNetRole(r?: string | null) {
  if (!r) return null;
  return r === 'router' ? 'Enrutador' : r === 'bridge' ? 'Puente' : r;
}

/** Extrae solo el nombre legible si el campo tiene datos key=value embebidos */
function cleanDeviceName(name?: string | null): string | null {
  if (!name) return null;
  const idx = name.search(/,[a-zA-Z]+=\S/);
  return idx > 0 ? name.slice(0, idx).trim() : name;
}

// ───────────────────────────────────────────────────────────────────────
export default function DeviceCard({ device, onRemove, onUpdate, isPreview }: DeviceCardProps) {
  const [antennaStats, setAntennaStats] = useState<AntennaStats | null>(device.cachedStats ?? null);
  const [isLoadingAntenna, setIsLoadingAntenna] = useState(false);
  const [antennaError, setAntennaError] = useState('');

  const handleLoadAntenna = async () => {
    if (!device.sshUser || !device.sshPass) {
      setAntennaError('Sin credenciales SSH — edita el dispositivo para agregarlas');
      return;
    }
    setIsLoadingAntenna(true);
    setAntennaError('');
    try {
      const res = await fetchWithTimeout(`${API_BASE_URL}/api/device/antenna`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceIP: device.ip,
          deviceUser: device.sshUser,
          devicePass: device.sshPass,
          devicePort: device.sshPort ?? 22,
        }),
      }, 20_000);
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message ?? 'Error obteniendo stats');
      const s: AntennaStats = data.stats;
      setAntennaStats(s);
      if (onUpdate) {
        onUpdate({
          ...device,
          lastSeen: Date.now(),
          name: s.deviceName || device.name,
          model: s.deviceModel || device.model,
          firmware: s.firmwareVersion || device.firmware,
          mac: s.wlanMac || device.mac,
          deviceName: s.deviceName ?? device.deviceName,
          lanMac: s.lanMac ?? device.lanMac,
          security: s.security ?? device.security,
          channelWidth: s.channelWidth ?? device.channelWidth,
          networkMode: s.networkMode ?? device.networkMode,
          chains: s.chains ?? device.chains,
          apMac: s.apMac ?? device.apMac,
          cachedStats: s,
        });
      }
    } catch (err: unknown) {
      setAntennaError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setIsLoadingAntenna(false);
    }
  };

  const roleLabel = device.role === 'ap' ? 'AP' : device.role === 'sta' ? 'CPE' : '?';
  const roleGrad = device.role === 'ap' ? 'from-indigo-500 to-indigo-600' : 'from-violet-500 to-violet-600';
  const sig = signalMeta(antennaStats?.signal);

  // Nombre a mostrar: deviceName cacheado limpio, o el de la tarjeta
  const displayName = cleanDeviceName(device.deviceName) || device.name;

  return (
    <div className="rounded-2xl overflow-hidden border border-slate-200 shadow-sm flex flex-col bg-white">

      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className={`bg-gradient-to-r ${roleGrad} px-4 py-3 flex items-center justify-between`}>
        <div className="flex items-center space-x-3 min-w-0">
          <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
            {device.role === 'ap' ? <Radio className="w-4.5 h-4.5 text-white" /> : <Signal className="w-4.5 h-4.5 text-white" />}
          </div>
          <div className="min-w-0">
            <div className="flex items-center space-x-2">
              <h3 className="font-bold text-white text-sm truncate">{displayName}</h3>
              <span className="text-[9px] font-bold bg-white/20 text-white px-1.5 py-0.5 rounded-md shrink-0">{roleLabel}</span>
            </div>
            <p className="text-[10px] text-white/70 font-mono truncate">{device.model} · {device.firmware}</p>
          </div>
        </div>
        {!isPreview && onRemove && (
          <button onClick={onRemove} className="p-1.5 text-white/50 hover:text-white hover:bg-white/20 rounded-lg transition-colors shrink-0">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
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
        {/* Modo inalámbrico badge */}
        {(() => {
          const m = antennaStats?.mode || device.cachedStats?.mode || (device.role !== 'unknown' ? device.role : null);
          if (!m) return null;
          const isAp = m === 'ap' || m === 'master';
          const isSta = m === 'sta';
          return (
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md
              ${isAp ? 'bg-indigo-100 text-indigo-700' : isSta ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-500'}`}>
              {isAp ? 'Punto de Acceso' : isSta ? 'Estación' : m.toUpperCase()}
            </span>
          );
        })()}
      </div>

      {/* ── ANTENA (sin tabs) ───────────────────────────────────────── */}
      <div className="flex-1 bg-slate-900 relative">

        {/* Capa de atenuación cuando está cargando (Skeleton UX) */}
        {isLoadingAntenna && (
          <div className="absolute inset-0 z-10 bg-slate-900/60 backdrop-blur-[1px] flex items-center justify-center transition-all duration-300">
            <div className="bg-slate-800 px-5 py-3 rounded-2xl flex items-center space-x-3 shadow-2xl border border-slate-700">
              <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
              <span className="text-sm font-bold text-slate-200">Consultando equipo...</span>
            </div>
          </div>
        )}

        {/* Botón */}
        <div className="p-4 pb-3 space-y-2">
          {device.cachedStats && device.lastSeen && (
            <p className="text-[11px] text-slate-400 text-center font-mono font-medium tracking-wide">
              <Clock className="w-3 h-3 inline mr-1 opacity-60" />
              {new Date(device.lastSeen).toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' })}
            </p>
          )}
          <button
            onClick={handleLoadAntenna}
            disabled={isLoadingAntenna || isPreview}
            title={isPreview ? "Modo vista previa" : ""}
            className="w-full flex items-center justify-center space-x-2 py-3 rounded-xl text-xs font-bold uppercase tracking-wider
                bg-slate-800 hover:bg-indigo-600 border border-slate-700 hover:border-indigo-500 text-white transition-all active:scale-[0.98]"
          >
            <RefreshCw className={`w-4 h-4 ${isLoadingAntenna ? 'animate-spin opacity-50' : ''}`} />
            <span>{(antennaStats || device.cachedStats) ? 'Actualizar Datos' : 'Obtener Telemetría'}</span>
          </button>
        </div>

        {antennaError && (
          <div className="mx-4 mb-3 px-3 py-2 bg-rose-900/50 border border-rose-700 rounded-xl">
            <p className="text-[11px] text-rose-300">{antennaError}</p>
          </div>
        )}

        {!antennaStats && !isLoadingAntenna && !antennaError && (
          <div className="px-4 pb-6 pt-2 flex flex-col items-center text-center space-y-2">
            <Waves className="w-8 h-8 text-slate-700 mt-2" />
            <p className="text-slate-500 text-xs">Presiona "Leer stats" para conectar via SSH</p>
          </div>
        )}

        {antennaStats && !antennaStats.raw && (
          <div className="px-4 pb-5 space-y-4">

            {/* ── Señal principal ── */}
            {antennaStats.signal != null && (
              <div className={`bg-gradient-to-br ${sig.grad} rounded-2xl p-4 border border-white/5 shadow-lg`}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-[11px] font-bold text-white/50 uppercase tracking-widest mb-0.5">Nivel de Señal</p>
                    <div className="flex items-end space-x-1.5">
                      <span className="text-5xl font-black text-white leading-none tracking-tighter">{antennaStats.signal}</span>
                      <span className="text-base text-white/60 font-mono mb-1">dBm</span>
                    </div>
                  </div>
                  <span className={`text-[11px] font-black uppercase tracking-wider px-3 py-1.5 rounded-lg ${sig.color} text-slate-900 shadow-sm`}>
                    {sig.label}
                  </span>
                </div>
                <Bar pct={sig.pct} color="bg-white" />
                {antennaStats.noiseFloor != null && (
                  <p className="text-[11px] text-white/50 mt-2 font-mono flex justify-between">
                    <span>Ruido: <strong className="text-white/80">{antennaStats.noiseFloor}</strong></span>
                    <span>SNR: <strong className="text-white">{Math.abs(antennaStats.signal - antennaStats.noiseFloor).toFixed(0)} dB</strong></span>
                  </p>
                )}
              </div>
            )}

            {/* ── CCQ ── */}
            {antennaStats.ccq != null && (
              <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Calidad CCQ</span>
                  <span className="font-mono text-lg font-black text-white">{antennaStats.ccq}%</span>
                </div>
                <Bar pct={antennaStats.ccq} color={ccqColor(antennaStats.ccq)} />
              </div>
            )}

            {/* ── TX / RX ── */}
            {(antennaStats.txRate != null || antennaStats.rxRate != null) && (
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4 flex flex-col items-center text-center">
                  <div className="flex items-center space-x-1.5 mb-1">
                    <ArrowUp className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">TX Rate</span>
                  </div>
                  <p className="font-mono text-2xl font-black text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.3)]">
                    {antennaStats.txRate ?? '—'}<span className="text-xs text-slate-500 ml-1">Mbps</span>
                  </p>
                </div>
                <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4 flex flex-col items-center text-center">
                  <div className="flex items-center space-x-1.5 mb-1">
                    <ArrowDown className="w-3.5 h-3.5 text-sky-400" />
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">RX Rate</span>
                  </div>
                  <p className="font-mono text-2xl font-black text-sky-400 drop-shadow-[0_0_8px_rgba(56,189,248,0.3)]">
                    {antennaStats.rxRate ?? '—'}<span className="text-xs text-slate-500 ml-1">Mbps</span>
                  </p>
                </div>
              </div>
            )}

            {/* ── AirMAX ── */}
            {antennaStats.airmaxEnabled != null && (
              <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Protocolo airMAX</span>
                  <div className="flex items-center space-x-2">
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-md uppercase tracking-wider
                        ${antennaStats.airmaxEnabled ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-800 text-slate-500'}`}>
                      {antennaStats.airmaxEnabled ? 'Activado' : 'Desactivado'}
                    </span>
                    {antennaStats.airmaxPriority && (
                      <span className="text-[11px] font-mono text-slate-400 bg-slate-800 px-2 py-1 rounded-md capitalize border border-slate-700">{antennaStats.airmaxPriority}</span>
                    )}
                  </div>
                </div>
                {antennaStats.airmaxEnabled && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Calidad AMC</p>
                      <div className="flex items-center space-x-2">
                        <span className="font-mono text-sm font-bold text-white">{antennaStats.airmaxQuality ?? '—'}%</span>
                        {antennaStats.airmaxQuality != null && (
                          <div className="flex-1 h-2 bg-black/30 rounded-full overflow-hidden">
                            <div className="h-full bg-violet-500 rounded-full shadow-[0_0_6px_#8b5cf6]"
                              style={{ width: `${antennaStats.airmaxQuality}%`, transition: 'width 1s ease' }} />
                          </div>
                        )}
                      </div>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Capacidad AMQ</p>
                      <div className="flex items-center space-x-2">
                        <span className="font-mono text-sm font-bold text-white">{antennaStats.airmaxCapacity ?? '—'}%</span>
                        {antennaStats.airmaxCapacity != null && (
                          <div className="flex-1 h-2 bg-black/30 rounded-full overflow-hidden">
                            <div className="h-full bg-fuchsia-500 rounded-full shadow-[0_0_6px_#d946ef]"
                              style={{ width: `${antennaStats.airmaxCapacity}%`, transition: 'width 1s ease' }} />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── CPU y Memoria (gauges) ── */}
            {(antennaStats.cpuLoad != null || antennaStats.memoryPercent != null) && (
              <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center space-x-2">
                  <Cpu className="w-3 h-3" /><span>Recursos del sistema</span>
                </p>
                <div className="flex justify-evenly">
                  <GaugeChart value={antennaStats.cpuLoad} label="CPU Load" color="#818cf8" />
                  <GaugeChart value={antennaStats.memoryPercent} label="Memoria" color="#0ea5e9" />
                </div>
              </div>
            )}

            {/* ── Parámetros del dispositivo ── */}
            <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4">
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center space-x-2">
                <Info className="w-3 h-3" /><span>Dispositivo</span>
              </p>
              <div className="flex flex-col">
                <ParamRow label="Modelo" value={antennaStats.deviceModel} />
                <ParamRow label="Nombre" value={cleanDeviceName(antennaStats.deviceName)} />
                <ParamRow label="Modo de red" value={fmtNetRole(antennaStats.networkMode)} />
                <ParamRow label="Versión" value={antennaStats.firmwareVersion} />
                <ParamRow label="Tiempo activo" value={antennaStats.uptimeStr} />
                <ParamRow label="Fecha" value={antennaStats.deviceDate} />
                <ParamRow label="WLAN MAC" value={antennaStats.wlanMac} />
                <ParamRow label="LAN MAC" value={antennaStats.lanMac} />
                <ParamRow label="LAN" value={antennaStats.lanInfo} />
              </div>
            </div>

            {/* ── Parámetros inalámbricos ── */}
            <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4">
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center space-x-2">
                <Wifi className="w-3 h-3" /><span>Inalámbrico</span>
              </p>
              <div className="flex flex-col">
                <ParamRow label="Modo inalámbrico" value={fmtMode(antennaStats.mode)} />
                <ParamRow label="SSID" value={antennaStats.essid} />
                <ParamRow label="Seguridad" value={fmtSecurity(antennaStats.security)} />
                <ParamRow label="Canal / Frec." value={
                  antennaStats.channelNumber && antennaStats.frequency
                    ? `${antennaStats.channelNumber} / ${antennaStats.frequency} MHz`
                    : antennaStats.frequency ? `${antennaStats.frequency} MHz` : null
                } />
                <ParamRow label="Ancho de canal" value={
                  antennaStats.channelWidth
                    ? `${antennaStats.channelWidth} MHz${antennaStats.channelWidthExt ? ` (${antennaStats.channelWidthExt})` : ''}`
                    : null
                } />
                <ParamRow label="Banda de frecuencia" value={antennaStats.freqRange} />
                <ParamRow label="Cadenas TX/RX" value={antennaStats.chains} />
                <ParamRow label="Potencia de TX" value={antennaStats.txPower != null ? `${antennaStats.txPower} dBm` : null} />
                <ParamRow label="Antena" value={antennaStats.antenna} />
                <ParamRow label="AP MAC" value={antennaStats.apMac} />
                <ParamRow label="Distancia" value={
                  antennaStats.distance != null
                    ? `${(antennaStats.distance * 0.000621371).toFixed(1)} millas (${(antennaStats.distance / 1000).toFixed(2)} km)`
                    : null
                } />
              </div>
            </div>

            {/* ── Estaciones (modo AP) ── */}
            {antennaStats.stations && antennaStats.stations.length > 0 && (
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center space-x-1.5">
                  <Activity className="w-3 h-3" /><span>Estaciones ({antennaStats.stations.length})</span>
                </p>
                <div className="rounded-xl overflow-hidden border border-slate-700">
                  {antennaStats.stations.map((sta, i) => (
                    <div key={i}
                      className={`flex items-center justify-between px-3 py-2.5 text-[11px]
                          ${i % 2 === 0 ? 'bg-slate-800/80' : 'bg-slate-800/40'}`}>
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

        {/* Fallback raw */}
        {antennaStats?.raw && (
          <div className="mx-4 mb-4">
            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Output SSH</p>
            <div className="bg-slate-800 rounded-xl overflow-hidden border border-slate-700">
              {antennaStats.raw.split('\n').filter(Boolean).map((line, i) => {
                const eq = line.indexOf('=');
                const k = eq > 0 ? line.slice(0, eq).trim() : line;
                const v = eq > 0 ? line.slice(eq + 1).trim() : '';
                return (
                  <div key={i} className={`flex items-center justify-between px-3 py-1.5 text-[11px]
                      ${i % 2 === 0 ? 'bg-slate-800/80' : 'bg-slate-800/40'}`}>
                    <span className="font-mono text-slate-400">{k}</span>
                    <span className="font-mono text-emerald-400 font-semibold">{v}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
