import { useState, useCallback, useEffect } from 'react';
import { X, AlertCircle, Loader2, RefreshCw, CheckCircle2, Download, Upload } from 'lucide-react';
import type { SavedDevice, AntennaStats } from '../../../../../types/devices';
import { fetchWithTimeout } from '../../../../../utils/fetchWithTimeout';
import { API_BASE_URL } from '../../../../../config';
import StatCard from '../StatCard';
import { fmtDbm, fmtPct, fmtCpu, fmtMem, fmtFw } from '../../utils/formatters';
import { sigColor, ccqColor } from '../../utils/colors';

const BASE = `${API_BASE_URL}/api/ap-monitor`;

function ApDetailModal({
  dev, onClose, onSave,
}: {
  dev: SavedDevice;
  onClose: () => void;
  onSave: (stats: AntennaStats) => void;
}) {
  const [stats, setStats] = useState<AntennaStats | null>(dev.cachedStats ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const refresh = useCallback(() => {
    if (!dev.sshUser || (!('hasSshPass' in dev ? dev.hasSshPass : false) && !dev.sshPass)) { setError('Sin credenciales SSH'); return; }
    setLoading(true); setError('');
    fetchWithTimeout(`${BASE}/ap-detail-direct`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: dev.id, ip: dev.ip, port: dev.sshPort ?? 22, user: dev.sshUser, pass: dev.sshPass }),
    }, 35_000)
      .then(r => r.json())
      .then(d => { if (d.success) { setStats(d.stats); setSaved(false); } else setError(d.message); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [dev]);

  useEffect(() => {
    if (!dev.cachedStats) {
      const t = setTimeout(() => refresh(), 0);
      return () => clearTimeout(t);
    }
  }, [dev.id, dev.cachedStats, refresh]);

  const handleSave = () => {
    if (!stats) return;
    onSave(stats);
    setSaved(true);
  };

  const s = stats;
  const memLabel = fmtMem(s?.memTotalKb, s?.memFreeKb, s?.memoryPercent);

  const trafficRows = s?.ifaceTraffic
    ? Object.entries(s.ifaceTraffic).filter(([, v]) => v.rxBytes > 0 || v.txBytes > 0)
    : [];

  return (
    <div className="modal-overlay"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-panel modal-panel-2xl max-h-[92vh]">
        <div className="modal-header-decorated modal-header-slate py-3">
          <div>
            <p className="text-sm font-bold text-white">{dev.cachedStats?.deviceName ?? dev.name ?? dev.ip}</p>
            <p className="text-2xs text-slate-400 mt-0.5">{dev.ip} · Detalle completo del AP</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={refresh} disabled={loading} className="modal-header-close disabled:opacity-40">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            </button>
            <button onClick={onClose} className="modal-header-close"><X className="w-4 h-4" /></button>
          </div>
        </div>

        <div className="overflow-y-auto p-5 space-y-4">
          {error && (
            <div className="flex items-start gap-2 p-3 bg-rose-50 border border-rose-200 rounded-xl dark:bg-rose-500/10 dark:border-rose-500/30">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <p className="text-xs text-rose-600 dark:text-rose-300">{error}</p>
            </div>
          )}
          {loading && !s && (
            <div className="flex items-center justify-center gap-3 py-12 text-slate-500 dark:text-slate-400">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Conectando SSH al AP…</span>
            </div>
          )}

          {s && (
            <>
              <div>
                <p className="text-3xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Sistema</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {s.deviceName && <StatCard label="Hostname" value={s.deviceName} />}
                  {s.deviceModel && <StatCard label="Modelo" value={s.deviceModel} />}
                  {s.firmwareVersion && <StatCard label="Firmware" value={fmtFw(s.firmwareVersion) ?? s.firmwareVersion} />}
                  {s.uptimeStr && <StatCard label="Uptime" value={s.uptimeStr} color="text-emerald-700" />}
                  {s.cpuLoad != null && <StatCard label="CPU" value={fmtCpu(s.cpuLoad)}
                    color={s.cpuLoad > 80 ? 'text-rose-600' : s.cpuLoad > 60 ? 'text-amber-600' : 'text-slate-700'} />}
                  {(s.memoryPercent != null || (s.memTotalKb && s.memFreeKb != null)) &&
                    <StatCard label="Memoria" value={memLabel}
                      sub={s.memTotalKb ? `${Math.round(s.memTotalKb / 1024)} MB total` : undefined}
                      color={parseInt(memLabel) > 85 ? 'text-rose-600' : parseInt(memLabel) > 70 ? 'text-amber-600' : 'text-slate-700'} />}
                  {s.lanMac && <StatCard label="MAC LAN" value={s.lanMac} />}
                  {s.wlanMac && <StatCard label="MAC WLAN" value={s.wlanMac} />}
                </div>
              </div>

              <div>
                <p className="text-3xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Radio / Wireless</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {s.essid && <StatCard label="SSID" value={s.essid} />}
                  {s.frequency && <StatCard label="Frecuencia" value={`${s.frequency} MHz`} sub={`${(s.frequency / 1000).toFixed(2)} GHz`} />}
                  {s.channelWidth && <StatCard label="Canal" value={`${s.channelWidth} MHz`} />}
                  {s.txPower != null && <StatCard label="TX Power" value={`${s.txPower} dBm`} />}
                  {s.mode && <StatCard label="Modo" value={s.mode} />}
                  {s.networkMode && <StatCard label="Modo Red" value={s.networkMode} />}
                  {s.security && <StatCard label="Seguridad" value={s.security} />}
                  {s.chains && <StatCard label="Cadenas" value={s.chains} />}
                  {s.airmaxEnabled != null && <StatCard label="AirMax"
                    value={s.airmaxEnabled ? 'Habilitado' : 'Deshabilitado'}
                    color={s.airmaxEnabled ? 'text-emerald-600' : 'text-slate-500 dark:text-slate-400'} />}
                  {s.airmaxQuality != null && <StatCard label="AM Quality" value={`${s.airmaxQuality}%`} />}
                  {s.airmaxCapacity != null && <StatCard label="AM Capacity" value={`${s.airmaxCapacity}%`} />}
                </div>
              </div>

              {(s.signal != null || s.ccq != null) && (
                <div>
                  <p className="text-3xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Señal RF</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                    {s.signal != null && <StatCard label="Señal" value={fmtDbm(s.signal)} color={sigColor(s.signal)} />}
                    {s.noiseFloor != null && <StatCard label="Noise" value={fmtDbm(s.noiseFloor)} />}
                    {s.ccq != null && <StatCard label="CCQ" value={fmtPct(s.ccq)} color={ccqColor(s.ccq)} />}
                    {s.txRate != null && <StatCard label="TX Rate" value={`${s.txRate} Mbps`} />}
                    {s.rxRate != null && <StatCard label="RX Rate" value={`${s.rxRate} Mbps`} />}
                  </div>
                </div>
              )}

              {trafficRows.length > 0 && (
                <div>
                  <p className="text-3xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Tráfico por Interfaz</p>
                  <div className="space-y-1">
                    {trafficRows.map(([iface, v]) => (
                      <div key={iface} className="flex items-center gap-4 bg-slate-50 rounded-lg px-3 py-2 border border-slate-100 text-xs dark:bg-slate-800/60 dark:border-slate-700">
                        <span className="font-mono font-bold text-slate-700 w-16 shrink-0">{iface}</span>
                        <span className="flex items-center gap-1 text-sky-700"><Download className="w-3 h-3" />
                          {(v.rxBytes / 1e6).toFixed(1)} MB RX
                        </span>
                        <span className="flex items-center gap-1 text-rose-600"><Upload className="w-3 h-3" />
                          {(v.txBytes / 1e6).toFixed(1)} MB TX
                        </span>
                        <span className="text-slate-500 dark:text-slate-400 text-2xs">{v.rxPackets + v.txPackets} pkts</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {s && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 shrink-0 bg-slate-50 rounded-b-2xl dark:border-slate-800 dark:bg-slate-900/60">
            <p className="text-2xs text-slate-400">Los datos de señal y tráfico son instantáneos y no se persisten</p>
            <button onClick={handleSave} disabled={saved}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all
                ${saved ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400' : 'bg-indigo-600 text-white hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400'}`}>
              {saved ? <><CheckCircle2 className="w-3.5 h-3.5" /> Guardado</> : 'Guardar en dispositivo'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default ApDetailModal;
