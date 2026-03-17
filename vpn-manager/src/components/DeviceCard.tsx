import { useState } from 'react';
import {
  Radio, Router, Signal, Trash2, RefreshCw, Loader2,
  ExternalLink, Activity, ArrowUp, ArrowDown, Zap, Waves,
  MonitorSpeaker, Cpu, MemoryStick, Clock, Wifi, Lock,
  Network, Info,
} from 'lucide-react';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';
import type { SavedDevice, AntennaStats } from '../types/devices';

interface DeviceCardProps {
  device: SavedDevice;
  onRemove: () => void;
  onUpdate: (updated: SavedDevice) => void;
}

// ── Gauge circular SVG ───────────────────────────────────────────────────
function GaugeChart({ value, label, color }: { value: number | null | undefined; label: string; color: string }) {
  const pct  = Math.max(0, Math.min(100, value ?? 0));
  const r    = 26;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  const warn = pct > 80 ? '#f87171' : pct > 60 ? '#fbbf24' : color;

  return (
    <div className="flex flex-col items-center space-y-1">
      <svg width="72" height="72" viewBox="0 0 72 72">
        <circle cx="36" cy="36" r={r} fill="none" stroke="#1e293b" strokeWidth="7" />
        <circle
          cx="36" cy="36" r={r} fill="none"
          stroke={value != null ? warn : '#334155'}
          strokeWidth="7"
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeLinecap="round"
          transform="rotate(-90 36 36)"
          style={{ transition: 'stroke-dasharray 0.7s ease' }}
        />
        <text x="36" y="41" textAnchor="middle"
          style={{ fill: 'white', fontSize: '13px', fontWeight: 'bold', fontFamily: 'monospace' }}>
          {value != null ? `${pct}%` : '—'}
        </text>
      </svg>
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</p>
    </div>
  );
}

// ── Barra de progreso ────────────────────────────────────────────────────
function Bar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="w-full h-1.5 bg-white/20 rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%`, transition: 'width 0.7s ease' }} />
    </div>
  );
}

// ── Fila de parámetro ────────────────────────────────────────────────────
function ParamRow({ label, value }: { label: string; value?: string | number | null }) {
  if (value == null || value === '') return null;
  return (
    <div className="flex items-start justify-between gap-2 py-1.5 border-b border-slate-800/60 last:border-0">
      <span className="text-[10px] text-slate-500 shrink-0">{label}</span>
      <span className="text-[11px] font-mono text-slate-300 text-right break-all">{value}</span>
    </div>
  );
}

// ── Calidad de señal ─────────────────────────────────────────────────────
function signalMeta(dbm: number | null | undefined) {
  if (dbm == null) return { label: '—', color: 'bg-slate-500', grad: 'from-slate-800 to-slate-900', pct: 0 };
  const pct = Math.max(0, Math.min(100, ((dbm - (-95)) / ((-40) - (-95))) * 100));
  if (dbm >= -65) return { label: 'Excelente', color: 'bg-emerald-400', grad: 'from-emerald-950 to-emerald-900', pct };
  if (dbm >= -75) return { label: 'Buena',     color: 'bg-sky-400',     grad: 'from-sky-950 to-sky-900',       pct };
  if (dbm >= -85) return { label: 'Regular',   color: 'bg-amber-400',   grad: 'from-amber-950 to-amber-900',   pct };
  return             { label: 'Mala',       color: 'bg-rose-400',    grad: 'from-rose-950 to-rose-900',     pct };
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

// ───────────────────────────────────────────────────────────────────────
export default function DeviceCard({ device, onRemove, onUpdate }: DeviceCardProps) {
  const [activeTab,        setActiveTab]        = useState<'antenna' | 'router'>('antenna');
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
      const s: AntennaStats = data.stats;
      setAntennaStats(s);
      // Guardar campos estáticos en SavedDevice (solo sobreescribe si tienen valor)
      onUpdate({
        ...device,
        lastSeen:    Date.now(),
        name:        s.deviceName    || device.name,
        model:       s.deviceModel   || device.model,
        firmware:    s.firmwareVersion || device.firmware,
        mac:         s.wlanMac       || device.mac,
        deviceName:  s.deviceName    ?? device.deviceName,
        lanMac:      s.lanMac        ?? device.lanMac,
        security:    s.security      ?? device.security,
        channelWidth: s.channelWidth ?? device.channelWidth,
        networkMode: s.networkMode   ?? device.networkMode,
        chains:      s.chains        ?? device.chains,
        apMac:       s.apMac         ?? device.apMac,
      });
    } catch (err: unknown) {
      setAntennaError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setIsLoadingAntenna(false);
    }
  };

  const roleLabel = device.role === 'ap' ? 'AP' : device.role === 'sta' ? 'CPE' : '?';
  const roleGrad  = device.role === 'ap' ? 'from-indigo-500 to-indigo-600' : 'from-violet-500 to-violet-600';
  const sig       = signalMeta(antennaStats?.signal);

  // Nombre a mostrar: deviceName cacheado, o el de la tarjeta
  const displayName = device.deviceName || device.name;

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
        <button onClick={onRemove} className="p-1.5 text-white/50 hover:text-white hover:bg-white/20 rounded-lg transition-colors shrink-0">
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
          {/* Botón */}
          <div className="p-4 pb-3">
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
                <div className={`bg-gradient-to-br ${sig.grad} rounded-2xl p-4`}>
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
                  <Bar pct={sig.pct} color="bg-white/70" />
                  {antennaStats.noiseFloor != null && (
                    <p className="text-[10px] text-white/40 mt-1.5 font-mono">
                      Ruido: {antennaStats.noiseFloor} dBm
                      {' · '}SNR: {(antennaStats.signal - antennaStats.noiseFloor).toFixed(0)} dB
                    </p>
                  )}
                </div>
              )}

              {/* ── CCQ ── */}
              {antennaStats.ccq != null && (
                <div className="bg-slate-800/60 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">CCQ</span>
                    <span className="font-mono text-lg font-black text-white">{antennaStats.ccq}%</span>
                  </div>
                  <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${ccqColor(antennaStats.ccq)}`}
                      style={{ width: `${antennaStats.ccq}%`, transition: 'width 0.7s ease' }} />
                  </div>
                </div>
              )}

              {/* ── TX / RX ── */}
              {(antennaStats.txRate != null || antennaStats.rxRate != null) && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-slate-800/60 rounded-xl p-3">
                    <div className="flex items-center space-x-1.5 mb-1">
                      <ArrowUp className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">TX Rate</span>
                    </div>
                    <p className="font-mono text-xl font-black text-emerald-400">
                      {antennaStats.txRate ?? '—'}<span className="text-xs text-slate-500 ml-1">Mbps</span>
                    </p>
                  </div>
                  <div className="bg-slate-800/60 rounded-xl p-3">
                    <div className="flex items-center space-x-1.5 mb-1">
                      <ArrowDown className="w-3.5 h-3.5 text-sky-400" />
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">RX Rate</span>
                    </div>
                    <p className="font-mono text-xl font-black text-sky-400">
                      {antennaStats.rxRate ?? '—'}<span className="text-xs text-slate-500 ml-1">Mbps</span>
                    </p>
                  </div>
                </div>
              )}

              {/* ── AirMAX ── */}
              {antennaStats.airmaxEnabled != null && (
                <div className="bg-slate-800/60 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">airMAX</span>
                    <div className="flex items-center space-x-2">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md
                        ${antennaStats.airmaxEnabled ? 'bg-emerald-900 text-emerald-400' : 'bg-slate-700 text-slate-500'}`}>
                        {antennaStats.airmaxEnabled ? 'Activado' : 'Desactivado'}
                      </span>
                      {antennaStats.airmaxPriority && (
                        <span className="text-[10px] font-mono text-slate-400 capitalize">{antennaStats.airmaxPriority}</span>
                      )}
                    </div>
                  </div>
                  {antennaStats.airmaxEnabled && (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <p className="text-[9px] text-slate-500 mb-1">Calidad</p>
                        <div className="flex items-center space-x-2">
                          <span className="font-mono text-sm font-bold text-white">{antennaStats.airmaxQuality ?? '—'}%</span>
                          {antennaStats.airmaxQuality != null && (
                            <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                              <div className="h-full bg-violet-400 rounded-full"
                                style={{ width: `${antennaStats.airmaxQuality}%` }} />
                            </div>
                          )}
                        </div>
                      </div>
                      <div>
                        <p className="text-[9px] text-slate-500 mb-1">Capacidad</p>
                        <div className="flex items-center space-x-2">
                          <span className="font-mono text-sm font-bold text-white">{antennaStats.airmaxCapacity ?? '—'}%</span>
                          {antennaStats.airmaxCapacity != null && (
                            <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                              <div className="h-full bg-fuchsia-400 rounded-full"
                                style={{ width: `${antennaStats.airmaxCapacity}%` }} />
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
                <div className="bg-slate-800/60 rounded-xl p-3">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center space-x-1.5">
                    <Cpu className="w-3 h-3" /><span>Recursos del sistema</span>
                  </p>
                  <div className="flex justify-around">
                    <GaugeChart value={antennaStats.cpuLoad}       label="CPU"    color="#6366f1" />
                    <GaugeChart value={antennaStats.memoryPercent} label="Memoria" color="#0ea5e9" />
                  </div>
                </div>
              )}

              {/* ── Parámetros del dispositivo ── */}
              <div className="bg-slate-800/60 rounded-xl p-3">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center space-x-1.5">
                  <Info className="w-3 h-3" /><span>Dispositivo</span>
                </p>
                <div>
                  <ParamRow label="Nombre"        value={antennaStats.deviceName} />
                  <ParamRow label="Modelo"        value={antennaStats.deviceModel} />
                  <ParamRow label="Firmware"      value={antennaStats.firmwareVersion} />
                  <ParamRow label="Modo de red"   value={fmtNetRole(antennaStats.networkMode)} />
                  <ParamRow label="Velocidad LAN" value={antennaStats.lanSpeed ? `${antennaStats.lanSpeed} Mbps` : null} />
                  <ParamRow label="Tiempo activo" value={antennaStats.uptimeStr} />
                  <ParamRow label="Fecha"         value={antennaStats.deviceDate} />
                  <ParamRow label="WLAN MAC"      value={antennaStats.wlanMac} />
                  <ParamRow label="LAN MAC"       value={antennaStats.lanMac} />
                </div>
              </div>

              {/* ── Parámetros inalámbricos ── */}
              <div className="bg-slate-800/60 rounded-xl p-3">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center space-x-1.5">
                  <Wifi className="w-3 h-3" /><span>Inalámbrico</span>
                </p>
                {(() => {
                  const freqBand = antennaStats.frequency
                    ? antennaStats.frequency < 3000 ? '2.4 GHz' : antennaStats.frequency < 6000 ? '5 GHz' : '6 GHz'
                    : null;
                  const distVal = antennaStats.distance != null
                    ? `${antennaStats.distance} m (${(antennaStats.distance / 1000).toFixed(2)} km / ${(antennaStats.distance * 0.000621371).toFixed(2)} mi)`
                    : null;
                  return (
                    <div>
                      <ParamRow label="Modo"          value={fmtMode(antennaStats.mode)} />
                      <ParamRow label="Banda"         value={freqBand} />
                      <ParamRow label="SSID"          value={antennaStats.essid} />
                      <ParamRow label="Seguridad"     value={fmtSecurity(antennaStats.security)} />
                      <ParamRow label="Canal / Frec." value={
                        antennaStats.channelNumber && antennaStats.frequency
                          ? `${antennaStats.channelNumber} / ${antennaStats.frequency} MHz`
                          : antennaStats.frequency ? `${antennaStats.frequency} MHz` : null
                      } />
                      <ParamRow label="Ancho de canal" value={antennaStats.channelWidth ? `${antennaStats.channelWidth} MHz` : null} />
                      <ParamRow label="AP MAC"        value={antennaStats.apMac} />
                      <ParamRow label="Cadenas TX/RX" value={antennaStats.chains} />
                      <ParamRow label="Potencia TX"   value={antennaStats.txPower != null ? `${antennaStats.txPower} dBm` : null} />
                      <ParamRow label="Distancia"     value={distVal} />
                    </div>
                  );
                })()}
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
