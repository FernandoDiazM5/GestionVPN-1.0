import { useState, useEffect, useRef } from 'react';
import { Loader2, RefreshCw, Info } from 'lucide-react';
import type { ScannedDevice, AntennaStats } from '../../../../types/devices';
import { fetchWithTimeout } from '../../../../utils/fetchWithTimeout';
import { API_BASE_URL } from '../../../../config';

interface DeviceStatusPanelProps {
  dev: ScannedDevice;
  /** §42 fix: mapa MAC normalizado → nombre del dispositivo, derivado del
   *  scan. Usado para resolver el hostname de cada estación cuando el AP
   *  no lo provee en wstalist. Opcional para no romper consumidores
   *  externos del componente. */
  stationNamesByMac?: Map<string, string>;
  onRefresh?: (stats: AntennaStats) => void;
}

const normalizeMac = (mac: string) => mac.toUpperCase().replace(/[:-]/g, '');

export function DeviceStatusPanel({ dev, stationNamesByMac, onRefresh }: DeviceStatusPanelProps) {
  const [stats, setStats] = useState<AntennaStats | undefined>(dev.cachedStats);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(dev.cachedStats ? Date.now() : null);
  const [showRaw, setShowRaw] = useState(false);

  const devRef = useRef(dev);
  devRef.current = dev;
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;
  const isFetchingRef = useRef(false);

  useEffect(() => { setStats(dev.cachedStats); }, [dev.cachedStats]);

  const fmtFirmware = (fw?: string) => {
    if (!fw) return null;
    const m = fw.match(/^([A-Z]+)\.?(v[\d.]+)/);
    return m ? `${m[2]} (${m[1]})` : fw;
  };

  const fmtAge = (ts: number | null) => {
    if (!ts) return null;
    const sec = Math.floor((Date.now() - ts) / 1000);
    if (sec < 10) return 'Ahora';
    if (sec < 60) return `Hace ${sec}s`;
    if (sec < 3600) return `Hace ${Math.floor(sec / 60)} min`;
    if (sec < 86400) return `Hace ${Math.floor(sec / 3600)} h`;
    return `Hace ${Math.floor(sec / 86400)} días`;
  };

  const doFetch = async () => {
    const d = devRef.current;
    if (!d.sshUser || (!('hasSshPass' in d ? d.hasSshPass : false) && !d.sshPass) || isFetchingRef.current) return;
    isFetchingRef.current = true;
    setRefreshing(true);
    try {
      const res = await fetchWithTimeout(`${API_BASE_URL}/api/device/antenna`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: 'id' in d ? d.id : undefined, deviceIP: d.ip, deviceUser: d.sshUser, devicePass: d.sshPass, devicePort: d.sshPort ?? 22 }),
      }, 15_000);
      const data = await res.json();
      if (data.success && data.stats) {
        setStats(data.stats);
        setLastUpdated(Date.now());
        onRefreshRef.current?.(data.stats);
      }
    } catch { /* silencioso */ }
    isFetchingRef.current = false;
    setRefreshing(false);
  };

  useEffect(() => {
    if (!dev.sshUser || (!('hasSshPass' in dev ? dev.hasSshPass : false) && !dev.sshPass)) return;
    const id = setInterval(doFetch, 5000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dev.sshUser, dev.sshPass]);

  const handleRefresh = () => doFetch();

  const signalPct = (sig: number) => Math.min(100, Math.max(0, Math.round((sig + 90) / 50 * 100)));
  const signalColor = (sig: number) => sig >= -65 ? '#22c55e' : sig >= -75 ? '#f59e0b' : '#ef4444';

  const Bar = ({ value, colorClass }: { value: number; colorClass: string }) => (
    <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all ${colorClass}`} style={{ width: `${Math.min(100, value)}%` }} />
    </div>
  );

  const s = stats;

  if (!s) {
    return (
      <div className="px-5 py-5 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-4">
        <span className="text-xs text-slate-400 italic">Sin estadísticas SSH disponibles.</span>
        {dev.sshUser && (
          <button onClick={handleRefresh} disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-50 transition-colors">
            {refreshing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            <span>Obtener datos</span>
          </button>
        )}
      </div>
    );
  }

  const snr = s.signal != null && s.noiseFloor != null ? s.signal - s.noiseFloor : null;
  const isLive = !!(dev.sshUser && dev.sshPass);

  return (
    <div className="border-t border-slate-200 bg-white">
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-700 text-white">
        <div className="flex items-center gap-2">
          <div className="w-1 h-4 bg-sky-400 rounded-full" />
          <span className="text-xs font-bold tracking-wide uppercase">Estado · {dev.ip}</span>
          {dev.sshUser && (
            <span className="text-[10px] font-mono bg-white/10 px-1.5 py-0.5 rounded">{dev.sshUser}</span>
          )}
          {isLive && (
            <span className="flex items-center gap-1 text-[10px] text-emerald-400">
              <span className={`w-1.5 h-1.5 rounded-full ${refreshing ? 'bg-emerald-400 animate-ping' : 'bg-emerald-400 animate-pulse'}`} />
              {refreshing ? 'Actualizando…' : lastUpdated ? fmtAge(lastUpdated) : 'En vivo'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {s._rawJson && (
            <button onClick={() => setShowRaw(r => !r)}
              className="flex items-center gap-1 text-[10px] text-slate-300 hover:text-white px-2 py-1 rounded hover:bg-white/10 transition-colors">
              <Info className="w-3 h-3" /><span>JSON</span>
            </button>
          )}
          {dev.sshUser && (
            <button onClick={handleRefresh} disabled={refreshing}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-bold bg-sky-500 hover:bg-sky-400 text-white disabled:opacity-50 transition-colors">
              {refreshing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
              <span>Ahora</span>
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
        <div className="px-4 py-3">
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest pb-1.5 border-b border-slate-100 mb-2">Configuración</p>
          {([
            // §42-4: IP + Nombre del sistema arriba de todo — son los dos
            // identificadores que el operador busca primero al abrir el panel.
            // Antes la IP solo aparecía en el header oscuro pequeño y el
            // "Nombre de dispositivo" quedaba enterrado en la lista.
            ['IP', dev.ip],
            ['Nombre del sistema', s.deviceName || dev.name],
            ['Modelo de Dispositivo', s.deviceModel || dev.model],
            ['Modo de máscara de red', (() => {
              const m = s.networkMode || '';
              if (m === 'router') return 'Enrutador';
              if (m === 'bridge') return 'Puente';
              return m || null;
            })()],
            ['Modo inalámbrico', (() => {
              const m = s.mode || dev.role || '';
              if (m === 'sta') return 'Estación';
              if (m === 'ap' || m === 'master') return 'Punto de Acceso';
              return m || null;
            })()],
            ['SSID', s.essid || dev.essid || dev.parentAp],
            ['Seguridad', s.security],
            ['Versión', fmtFirmware(s.firmwareVersion || dev.firmware)],
            ['Tiempo activo', s.uptimeStr],
            ['Fecha dispositivo', s.deviceDate],
            ['Canal/Frecuencia', (() => {
              const freq = s.frequency ?? dev.frequency;
              if (s.channelNumber != null && freq != null) return `${s.channelNumber} / ${freq} MHz`;
              if (freq != null) return `${freq} MHz`;
              return null;
            })()],
            ['Ancho de canal', s.channelWidth != null ? `${s.channelWidth} MHz` : null],
            ['Banda de frecuencia', s.freqRange],
            ['Distancia', s.distance != null ? `${s.distance} m (${(s.distance / 1609).toFixed(2)} mi)` : null],
            ['Cadenas de TX/RX', s.chains],
            ['Potencia de TX', s.txPower != null ? `${s.txPower} dBm` : null],
            ['Antena', s.antenna],
            ['Modo HT/WiFi', s.opmode],
            ['País/Región', s.countryCode],
            ['Familia FW', s.fwPrefix],
            ['WLAN MAC', s.wlanMac || dev.mac],
            ['LAN MAC', s.lanMac],
            ['LAN0', s.lanInfo],
            ['Temperatura', s.temperature != null ? `${s.temperature} °C` : null],
            ['CINR', s.cinr != null ? `${s.cinr} dB` : null],
            ['Flujos TX/RX (NSS)', (s.txNss != null || s.rxNss != null) ? `${s.txNss ?? '—'} / ${s.rxNss ?? '—'}` : null],
            ['Índice MCS TX/RX', (s.txIdx != null || s.rxIdx != null) ? `${s.txIdx ?? '—'} / ${s.rxIdx ?? '—'}` : null],
            ['Airtime total', s.airtime != null ? `${s.airtime}%` : null],
            ['Capac. DL/UL polling', (s.dcap != null || s.ucap != null) ? `${s.dcap ?? '—'}% / ${s.ucap ?? '—'}%` : null],
            ['GPS Sync', s.gpsSync != null ? (s.gpsSync ? 'Sí' : 'No') : null],
            ['Reintentos TX', s.txRetries != null ? String(s.txRetries) : null],
            ['Balizas perdidas', s.missedBeacons != null ? String(s.missedBeacons) : null],
            ['RSSI por cadena', s.chainRssi && s.chainRssi.length > 0 ? s.chainRssi.map(v => `${v} dBm`).join(' / ') : null],
            ['ATPC', s.atpcStatus],
            ['Airsync', s.airsyncMode],
            ['Estaciones', s.stations != null ? String(s.stations.length) : null],
          ] as [string, string | null | undefined][]).filter(([, v]) => v).map(([label, value]) => (
            <div key={label} className="flex items-baseline justify-between py-1 border-b border-slate-50 gap-2">
              <span className="text-[11px] text-slate-500 shrink-0">{label}:</span>
              <span className="text-[11px] font-semibold text-slate-800 font-mono text-right truncate max-w-[58%]">{value}</span>
            </div>
          ))}
        </div>

        <div className="px-4 py-3 space-y-3">
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest pb-1.5 border-b border-slate-100">Métricas en tiempo real</p>

          {s.cpuLoad != null && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] text-slate-500">CPU:</span>
                <span className={`text-[11px] font-bold font-mono ${s.cpuLoad < 50 ? 'text-sky-600' : s.cpuLoad < 80 ? 'text-amber-500' : 'text-rose-500'}`}>{s.cpuLoad} %</span>
              </div>
              <Bar value={s.cpuLoad} colorClass={s.cpuLoad < 50 ? 'bg-sky-400' : s.cpuLoad < 80 ? 'bg-amber-400' : 'bg-rose-500'} />
            </div>
          )}

          {s.memoryPercent != null && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] text-slate-500">Memory:</span>
                <span className={`text-[11px] font-bold font-mono ${s.memoryPercent < 60 ? 'text-emerald-600' : s.memoryPercent < 80 ? 'text-amber-500' : 'text-rose-500'}`}>{s.memoryPercent} %</span>
              </div>
              <Bar value={s.memoryPercent} colorClass={s.memoryPercent < 60 ? 'bg-emerald-400' : s.memoryPercent < 80 ? 'bg-amber-400' : 'bg-rose-500'} />
            </div>
          )}

          {s.apMac && (
            <div className="flex items-center justify-between py-1 border-t border-slate-50">
              <span className="text-[11px] text-slate-500">AP MAC:</span>
              <span className="text-[11px] font-bold font-mono text-slate-700">{s.apMac}</span>
            </div>
          )}

          {s.signal != null && (
            <div className="border-t border-slate-100 pt-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] text-slate-500">Intensidad de la señal:</span>
                <span className="text-[11px] font-bold font-mono" style={{ color: signalColor(s.signal) }}>{s.signal} dBm</span>
              </div>
              <div className="relative h-2.5 rounded-full overflow-hidden"
                style={{ background: 'linear-gradient(to right, #ef4444 0%, #f59e0b 40%, #22c55e 80%)' }}>
                <div className="absolute right-0 top-0 h-full bg-slate-100 rounded-r-full"
                  style={{ width: `${100 - signalPct(s.signal)}%` }} />
              </div>
            </div>
          )}

          <div className="space-y-1 border-t border-slate-100 pt-2">
            {s.noiseFloor != null && (
              <div className="flex justify-between">
                <span className="text-[11px] text-slate-500">Umbral mínimo de ruido:</span>
                <span className="text-[11px] font-mono font-semibold text-slate-700">{s.noiseFloor} dBm</span>
              </div>
            )}
            {snr != null && (
              <div className="flex justify-between">
                <span className="text-[11px] text-slate-500">SNR:</span>
                <span className={`text-[11px] font-mono font-bold ${snr >= 30 ? 'text-emerald-600' : snr >= 15 ? 'text-sky-600' : 'text-amber-500'}`}>{snr} dB</span>
              </div>
            )}
            {s.ccq != null && (
              <div className="flex justify-between">
                <span className="text-[11px] text-slate-500">Transmitir CCQ:</span>
                <span className={`text-[11px] font-mono font-bold ${s.ccq >= 80 ? 'text-emerald-600' : s.ccq >= 60 ? 'text-sky-600' : 'text-amber-500'}`}>{s.ccq} %</span>
              </div>
            )}
            {(s.txRate != null || s.rxRate != null) && (
              <div className="flex justify-between">
                <span className="text-[11px] text-slate-500">Velocidad de TX/RX:</span>
                <span className="text-[11px] font-mono font-semibold text-slate-700">{s.txRate ?? '—'} Mbps / {s.rxRate ?? '—'} Mbps</span>
              </div>
            )}
          </div>

          {(s.airmaxEnabled != null || s.airmaxQuality != null || s.airmaxCapacity != null) && (
            <div className="border-t border-slate-100 pt-2 space-y-2">
              {s.airmaxEnabled != null && (
                <div className="flex justify-between items-center">
                  <span className="text-[11px] text-slate-500">airMAX:</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${s.airmaxEnabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    {s.airmaxEnabled ? 'Activado' : 'Desactivado'}
                  </span>
                </div>
              )}
              {s.airmaxPriority && (
                <div className="flex justify-between">
                  <span className="text-[11px] text-slate-500">Prioridad airMAX:</span>
                  <span className="text-[11px] font-semibold text-slate-700 capitalize">{s.airmaxPriority}</span>
                </div>
              )}
              {s.airmaxQuality != null && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] text-slate-500">Calidad airMAX:</span>
                    <span className={`text-[11px] font-bold font-mono ${s.airmaxQuality >= 80 ? 'text-emerald-600' : s.airmaxQuality >= 60 ? 'text-sky-600' : 'text-amber-500'}`}>{s.airmaxQuality} %</span>
                  </div>
                  <Bar value={s.airmaxQuality} colorClass={s.airmaxQuality >= 80 ? 'bg-emerald-400' : s.airmaxQuality >= 60 ? 'bg-sky-400' : 'bg-amber-400'} />
                </div>
              )}
              {s.airmaxCapacity != null && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] text-slate-500">Capacidad airMAX:</span>
                    <span className={`text-[11px] font-bold font-mono ${s.airmaxCapacity >= 80 ? 'text-emerald-600' : s.airmaxCapacity >= 60 ? 'text-sky-600' : 'text-amber-500'}`}>{s.airmaxCapacity} %</span>
                  </div>
                  <Bar value={s.airmaxCapacity} colorClass={s.airmaxCapacity >= 80 ? 'bg-emerald-400' : s.airmaxCapacity >= 60 ? 'bg-sky-400' : 'bg-amber-400'} />
                </div>
              )}
            </div>
          )}

          {s.temperature != null && (
            <div className="border-t border-slate-100 pt-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] text-slate-500">Temperatura:</span>
                <span className={`text-[11px] font-bold font-mono ${s.temperature < 60 ? 'text-emerald-600' : s.temperature < 80 ? 'text-amber-500' : 'text-rose-500'}`}>{s.temperature} °C</span>
              </div>
              <Bar value={Math.round((s.temperature / 100) * 100)} colorClass={s.temperature < 60 ? 'bg-emerald-400' : s.temperature < 80 ? 'bg-amber-400' : 'bg-rose-500'} />
            </div>
          )}

          {s.cinr != null && (
            <div className="flex justify-between border-t border-slate-100 pt-2">
              <span className="text-[11px] text-slate-500">CINR:</span>
              <span className={`text-[11px] font-mono font-bold ${s.cinr >= 20 ? 'text-emerald-600' : s.cinr >= 10 ? 'text-sky-600' : 'text-amber-500'}`}>{s.cinr} dB</span>
            </div>
          )}

          {s.airtime != null && (
            <div className="border-t border-slate-100 pt-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] text-slate-500">Airtime:</span>
                <span className={`text-[11px] font-bold font-mono ${s.airtime < 50 ? 'text-emerald-600' : s.airtime < 80 ? 'text-amber-500' : 'text-rose-500'}`}>{s.airtime}%</span>
              </div>
              <Bar value={s.airtime} colorClass={s.airtime < 50 ? 'bg-emerald-400' : s.airtime < 80 ? 'bg-amber-400' : 'bg-rose-500'} />
            </div>
          )}
        </div>
      </div>

      {s.stations && s.stations.length > 0 && (
        <div className="px-4 py-3 border-t border-slate-100">
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">
            Estaciones conectadas ({s.stations.length})
          </p>
          <div className="space-y-1">
            {s.stations.map((sta, i) => {
              // §42 fix: el AP no provee el hostname real del CPE en wstalist
              // (a veces devuelve su propio nombre, ya filtrado en backend).
              // Cruzamos por MAC con los datos del scan, donde el CPE ya fue
              // identificado por su `deviceName` al autenticar SSH. Fallback
              // al sta.hostname si por alguna razón el firmware sí lo entrega.
              const resolvedName = sta.mac
                ? stationNamesByMac?.get(normalizeMac(sta.mac)) ?? sta.hostname
                : sta.hostname;
              return (
              <div key={i} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-1.5 bg-slate-50 rounded-lg border border-slate-100 text-[11px]">
                <span className="font-mono font-semibold text-slate-700 w-36 shrink-0">{sta.mac}</span>
                {/* §42 fix: hostname (resuelto vía scan) + IP por estación.
                    Antes solo se mostraba el MAC, críptico para el operador. */}
                {resolvedName && (
                  <span
                    className="font-semibold text-slate-600 truncate max-w-[180px]"
                    title={`Nombre del equipo remoto: ${resolvedName}`}
                  >
                    {resolvedName}
                  </span>
                )}
                {sta.lastIp && (
                  <span
                    className="font-mono text-sky-600 shrink-0"
                    title={`Última IP conocida del cliente: ${sta.lastIp}`}
                  >
                    {sta.lastIp}
                  </span>
                )}
                {sta.signal != null && (
                  <span className={`font-bold font-mono w-16 ${sta.signal >= -65 ? 'text-emerald-600' : sta.signal >= -75 ? 'text-sky-600' : 'text-amber-500'}`}>
                    {sta.signal} dBm
                  </span>
                )}
                {sta.ccq != null && <span className="text-slate-500 w-16">CCQ {sta.ccq}%</span>}
                {sta.txRate != null && <span className="font-mono text-slate-500">↑ {sta.txRate} Mbps</span>}
                {sta.rxRate != null && <span className="font-mono text-slate-500">↓ {sta.rxRate} Mbps</span>}
                {sta.distance != null && <span className="text-slate-400 ml-auto">{sta.distance} m</span>}
              </div>
              );
            })}
          </div>
        </div>
      )}

      {showRaw && s._rawJson && (
        <div className="border-t border-slate-200">
          <div className="flex items-center justify-between px-4 py-1.5 bg-slate-100">
            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">
              mca-status JSON · {s.deviceModel || dev.model}
            </span>
            <button onClick={() => { navigator.clipboard?.writeText(s._rawJson!); }}
              className="text-[9px] font-bold text-indigo-500 hover:text-indigo-700 transition-colors">
              Copiar
            </button>
          </div>
          <pre className="p-3 text-[9px] font-mono text-slate-600 bg-slate-50 overflow-x-auto max-h-48 leading-relaxed">
            {s._rawJson}
          </pre>
        </div>
      )}
    </div>
  );
}
