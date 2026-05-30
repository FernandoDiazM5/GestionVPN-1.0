import { useState } from 'react';
import { X, ChevronDown } from 'lucide-react';
import type { ScannedDevice } from '../../../../types/devices';
import { fmtBytes, fmtPkts } from '../constants';
import { RawBlock } from './RawBlock';

export function SshDataModal({ dev, onClose }: { dev: ScannedDevice; onClose: () => void }) {
  const s = dev.cachedStats;
  const [showJson, setShowJson] = useState(false);
  if (!s) return null;

  const snr = s.signal != null && s.noiseFloor != null ? s.signal - s.noiseFloor : null;
  const fmtFw = (fw?: string) => {
    if (!fw) return null;
    const m = fw.match(/^([A-Z]+)\.?(v[\d.]+)/);
    return m ? `${m[2]} (${m[1]})` : fw;
  };
  const col = (v: number | null | undefined, hi: number, mid: number) =>
    v != null ? (v >= hi ? 'text-emerald-600' : v >= mid ? 'text-sky-600' : 'text-amber-500') : '';
  const colLow = (v: number | null | undefined, lo: number, mid: number) =>
    v != null ? (v < lo ? 'text-emerald-600' : v < mid ? 'text-amber-500' : 'text-rose-500') : '';

  const groups = [
    {
      title: 'Señal RF', items: [
        { l: 'Señal', v: s.signal != null ? `${s.signal} dBm` : null, c: col(s.signal, -65, -75), mono: true },
        { l: 'Noise Floor', v: s.noiseFloor != null ? `${s.noiseFloor} dBm` : null, mono: true },
        { l: 'SNR', v: snr != null ? `${snr} dB` : null, c: col(snr, 30, 15), mono: true },
        { l: 'CCQ', v: s.ccq != null ? `${s.ccq}%` : null, c: col(s.ccq, 80, 60), mono: true },
        { l: 'TX Rate', v: s.txRate != null ? `${s.txRate} Mbps` : null, mono: true },
        { l: 'RX Rate', v: s.rxRate != null ? `${s.rxRate} Mbps` : null, mono: true },
      ]
    },
    {
      title: 'AirMax', items: [
        { l: 'AM Quality', v: s.airmaxQuality != null ? `${s.airmaxQuality}%` : null, c: col(s.airmaxQuality, 80, 60), mono: true },
        { l: 'AM Capacity', v: s.airmaxCapacity != null ? `${s.airmaxCapacity}%` : null, c: col(s.airmaxCapacity, 80, 60), mono: true },
        { l: 'AirMax', v: s.airmaxEnabled != null ? (s.airmaxEnabled ? 'Habilitado' : 'Deshabilitado') : null },
      ]
    },
    {
      title: 'Canal / RF', items: [
        { l: 'Frecuencia', v: s.frequency != null ? `${s.frequency} MHz` : null, mono: true },
        { l: 'Ancho Canal', v: s.channelWidth != null ? `${s.channelWidth} MHz` : null, mono: true },
        { l: 'TX Power', v: s.txPower != null ? `${s.txPower} dBm` : null, mono: true },
        { l: 'Distancia', v: s.distance != null ? `${s.distance} m` : null, mono: true },
        { l: 'Chains', v: s.chains || null, mono: true },
      ]
    },
    {
      title: 'Sistema', items: [
        { l: 'CPU', v: s.cpuLoad != null ? `${s.cpuLoad}%` : null, c: colLow(s.cpuLoad, 50, 80), mono: true },
        { l: 'RAM', v: s.memoryPercent != null ? `${s.memoryPercent}%` : null, c: colLow(s.memoryPercent, 60, 80), mono: true },
        { l: 'Uptime', v: s.uptimeStr || null, mono: true },
        { l: 'Fecha', v: s.deviceDate || null },
        { l: 'Firmware', v: fmtFw(s.firmwareVersion || dev.firmware) },
        { l: 'Modelo', v: s.deviceModel || dev.model || null },
        { l: 'Hostname', v: s.deviceName || dev.name || null },
      ]
    },
    {
      title: 'Red', items: [
        { l: 'Modo', v: s.mode || null },
        { l: 'Modo Red', v: s.networkMode || null },
        { l: 'SSID', v: s.essid || null },
        { l: 'Seguridad', v: s.security || null },
        { l: 'WLAN MAC', v: s.wlanMac || null, mono: true },
        { l: 'LAN MAC', v: s.lanMac || null, mono: true },
        { l: 'AP MAC', v: s.apMac || null, mono: true },
      ]
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm px-4 py-6 animate-in fade-in duration-200"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between bg-slate-800 rounded-t-2xl px-5 py-3 shrink-0">
          <div>
            <p className="text-xs font-bold text-white font-mono">{dev.ip}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">
              {s.deviceName || dev.name} · {s.deviceModel || dev.model}
              {dev.sshUser && <span className="ml-2 text-emerald-400">· SSH: {dev.sshUser}</span>}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-y-auto p-5 space-y-4">
          {groups.map(group => {
            const items = group.items.filter(i => i.v != null && i.v !== '');
            if (!items.length) return null;
            return (
              <div key={group.title}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap">{group.title}</span>
                  <div className="flex-1 border-t border-slate-100" />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {items.map(item => (
                    <div key={item.l} className="bg-slate-50 rounded-lg px-3 py-2 border border-slate-200 shadow-sm">
                      <p className="text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">{item.l}</p>
                      <p className={`text-sm font-bold truncate ${item.c ?? 'text-slate-800'} ${item.mono ? 'font-mono tracking-tight' : ''}`}>{item.v}</p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {s.stations && s.stations.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Estaciones ({s.stations.length})</span>
                <div className="flex-1 border-t border-slate-100" />
              </div>
              <div className="space-y-1">
                {s.stations.map((sta, i) => (
                  <div key={i} className="bg-slate-50 rounded-lg px-3 py-3 border border-slate-200 flex flex-wrap gap-x-4 gap-y-1 items-center shadow-sm">
                    <span className="font-mono text-xs font-semibold text-slate-700">{sta.mac}</span>
                    {sta.signal != null && <span className={`text-xs font-bold ${sta.signal >= -65 ? 'text-emerald-600' : sta.signal >= -75 ? 'text-sky-600' : 'text-amber-500'}`}>{sta.signal} dBm</span>}
                    {sta.ccq != null && <span className="text-xs text-slate-600">CCQ <span className="font-semibold">{sta.ccq}%</span></span>}
                    {sta.txRate != null && <span className="font-mono text-xs text-slate-600">TX <span className="font-semibold">{sta.txRate}</span> Mbps</span>}
                    {sta.rxRate != null && <span className="font-mono text-xs text-slate-600">RX <span className="font-semibold">{sta.rxRate}</span> Mbps</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {s.ifaceTraffic && Object.keys(s.ifaceTraffic).length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Tráfico por interfaz</span>
                <div className="flex-1 border-t border-slate-100" />
              </div>
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <div className="grid grid-cols-[80px_1fr_1fr_1fr_1fr] bg-slate-100 border-b border-slate-200 px-4 py-2.5
                  text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  <span>Interfaz</span>
                  <span className="text-right">RX Bytes</span>
                  <span className="text-right">RX Paq.</span>
                  <span className="text-right">TX Bytes</span>
                  <span className="text-right">TX Paq.</span>
                </div>
                {Object.entries(s.ifaceTraffic).map(([iface, t], idx) => (
                  <div key={iface}
                    className={`grid grid-cols-[80px_1fr_1fr_1fr_1fr] px-4 py-3 border-b border-slate-100 last:border-0 text-xs items-center
                      ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                    <span className="font-mono font-bold text-slate-700">{iface}</span>
                    <span className="font-mono text-right text-sky-700 font-semibold">{fmtBytes(t.rxBytes)}</span>
                    <span className="font-mono text-right text-slate-500">{fmtPkts(t.rxPackets)}</span>
                    <span className="font-mono text-right text-indigo-700 font-semibold">{fmtBytes(t.txBytes)}</span>
                    <span className="font-mono text-right text-slate-500">{fmtPkts(t.txPackets)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {s.memTotalKb != null && s.memTotalKb > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Memoria (meminfo)</span>
                <div className="flex-1 border-t border-slate-100" />
              </div>
              {(() => {
                const total = s.memTotalKb!;
                const free = s.memFreeKb ?? 0;
                const buf = s.memBuffersKb ?? 0;
                const cache = s.memCachedKb ?? 0;
                const used = total - free - buf - cache;
                const pct = (v: number) => Math.round((v / total) * 100);
                const bar = (v: number, cls: string) => (
                  <div className={`h-full ${cls}`} style={{ width: `${pct(v)}%` }} title={`${fmtBytes(v * 1024)} (${pct(v)}%)`} />
                );
                return (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-4 bg-slate-100 rounded-full overflow-hidden flex">
                        {bar(Math.max(0, used), 'bg-rose-400')}
                        {bar(buf, 'bg-amber-400')}
                        {bar(cache, 'bg-sky-400')}
                        {bar(free, 'bg-emerald-400')}
                      </div>
                      <span className="text-[9px] font-bold text-slate-500 shrink-0">{fmtBytes(total * 1024)}</span>
                    </div>
                    <div className="flex flex-wrap gap-3 text-[9px]">
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-rose-400 shrink-0" />Usada {pct(Math.max(0, used))}% · {fmtBytes(Math.max(0, used) * 1024)}</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-amber-400 shrink-0" />Buffers {pct(buf)}%</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-sky-400 shrink-0" />Caché {pct(cache)}%</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-400 shrink-0" />Libre {pct(free)}% · {fmtBytes(free * 1024)}</span>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          <RawBlock title="Parámetros inalámbricos (iwconfig ath0)" content={s._rawIwconfig} />
          <RawBlock title="Estaciones conectadas (wstalist)" content={s._rawWstalist} />
          <RawBlock title="Estado del enlace (mca-cli-op info)" content={s._rawMcaCli} />
          <RawBlock title="Tabla de rutas (route -n)" content={s._rawRoutes} />
          <RawBlock title="Sistema / Kernel (uname + uptime)" content={s._rawUname} />
          <RawBlock title="Memoria raw (/proc/meminfo)" content={s._rawMeminfo} />

          {s._rawJson && (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <button onClick={() => setShowJson(v => !v)}
                className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-slate-100 transition-colors text-left">
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">JSON crudo de mca-status</span>
                <div className="flex items-center gap-2">
                  {!showJson && <span className="text-[9px] text-slate-400">ver</span>}
                  <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${showJson ? 'rotate-180' : ''}`} />
                </div>
              </button>
              {showJson && (
                <div className="relative">
                  <button onClick={() => navigator.clipboard?.writeText(s._rawJson!)}
                    className="absolute right-2 top-2 text-[9px] font-bold text-indigo-500 hover:text-indigo-700 bg-white px-2 py-0.5 rounded border border-indigo-200 z-10">
                    Copiar
                  </button>
                  <pre className="p-3 text-[9px] font-mono text-slate-600 bg-slate-50 overflow-x-auto max-h-72 leading-relaxed">{s._rawJson}</pre>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
