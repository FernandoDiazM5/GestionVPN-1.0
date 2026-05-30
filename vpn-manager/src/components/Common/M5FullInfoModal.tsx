import { useState } from 'react';
import type { ReactNode } from 'react';
import { Activity, Check, Copy, Cpu, Network, Shield, Wifi, X } from 'lucide-react';
import type { ScannedDevice, SavedDevice, AntennaStats } from '../types/devices';

function M5Row({ label, value }: { label: string; value?: string | number | null }) {
  if (value == null || value === '') return null;
  return (
    <>
      <span className="text-[11px] text-slate-500 truncate">{label}:</span>
      <span className="text-[11px] font-mono font-semibold text-slate-800 truncate">{String(value)}</span>
    </>
  );
}

function M5Section({ title, icon, colorClass, children }: {
  title: string; icon: ReactNode; colorClass: string; children: ReactNode;
}) {
  return (
    <div className={`rounded-xl border p-4 ${colorClass}`}>
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <p className="text-xs font-bold uppercase tracking-widest">{title}</p>
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-0.5">
        {children}
      </div>
    </div>
  );
}

function detectFamily(dev: ScannedDevice | SavedDevice): 'ac' | 'm5' | 'unknown' {
  const model = (dev.cachedStats?.deviceModel ?? dev.model ?? '').toUpperCase();
  const fw    = (dev.cachedStats?.fwPrefix ?? '').toUpperCase();
  if (/\bAC\b|5AC|AC\d|ACGEN/.test(model) || fw === 'XC') return 'ac';
  if (/M[235679]\b|M900/.test(model) || fw === 'XW' || fw === 'XM') return 'm5';
  return 'unknown';
}

function IfaceBlock({ ifc }: { ifc: NonNullable<AntennaStats['ifaceDetails']>[number] }) {
  return (
    <div className="col-span-2 border border-violet-100 rounded-lg p-3 mb-2 bg-white">
      <div className="flex items-center gap-2 mb-2">
        <p className="text-[10px] font-bold text-violet-600 uppercase font-mono">{ifc.ifname}</p>
        {ifc.hwaddr && <p className="text-[10px] text-slate-400 font-mono">{ifc.hwaddr}</p>}
        {ifc.ipaddr && <p className="text-[10px] font-mono font-bold text-sky-600 ml-auto">{ifc.ipaddr}</p>}
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-0.5">
        {ifc.mtu      != null && <M5Row label="mtu"     value={String(ifc.mtu)} />}
        {ifc.enabled  != null && <M5Row label="enabled" value={ifc.enabled ? 'Sí' : 'No'} />}
        {ifc.plugged  != null && <M5Row label="plugged" value={ifc.plugged ? 'Cable conectado' : 'Sin cable'} />}
        {ifc.speed    != null && <M5Row label="speed"   value={`${ifc.speed} Mbps`} />}
        {ifc.duplex   != null && <M5Row label="duplex"  value={ifc.duplex ? 'Full' : 'Half'} />}
        {ifc.dhcpc    != null && <M5Row label="dhcpc"   value={ifc.dhcpc ? 'Activo' : 'No'} />}
        {ifc.dhcpd    != null && <M5Row label="dhcpd"   value={ifc.dhcpd ? 'Activo' : 'No'} />}
        {ifc.snr      != null && <M5Row label="snr"     value={`${ifc.snr} dB`} />}
        {ifc.cableLen != null && <M5Row label="cable_len" value={`${ifc.cableLen} m`} />}
        {ifc.txBytesIfc != null && <M5Row label="tx_bytes" value={`${(ifc.txBytesIfc / 1024 / 1024).toFixed(1)} MB`} />}
        {ifc.rxBytesIfc != null && <M5Row label="rx_bytes" value={`${(ifc.rxBytesIfc / 1024 / 1024).toFixed(1)} MB`} />}
        {ifc.txErrors != null && <M5Row label="tx_errors" value={String(ifc.txErrors)} />}
        {ifc.rxErrors != null && <M5Row label="rx_errors" value={String(ifc.rxErrors)} />}
      </div>
    </div>
  );
}

export default function M5FullInfoModal({ dev, onClose }: { dev: ScannedDevice | SavedDevice; onClose: () => void }) {
  const s = dev.cachedStats;
  const [copiedIp, setCopiedIp] = useState(false);
  const family = detectFamily(dev);

  const copyIp = () => {
    navigator.clipboard.writeText(dev.ip).then(() => { setCopiedIp(true); setTimeout(() => setCopiedIp(false), 1500); });
  };

  const familyBadge = family === 'ac'
    ? <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-sky-500/30 text-sky-200 uppercase tracking-wide">AC</span>
    : family === 'm5'
      ? <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/30 text-amber-200 uppercase tracking-wide">M5</span>
      : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm px-4 py-6 animate-in fade-in duration-200"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between bg-slate-800 rounded-t-2xl px-5 py-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center">
              <Activity className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold text-white">{s?.deviceName ?? dev.name}</p>
                {familyBadge}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <p className="text-[10px] text-slate-300 font-mono">{dev.ip}</p>
                <button onClick={copyIp} className="text-slate-400 hover:text-white transition-colors">
                  {copiedIp ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                </button>
                <span className="text-[10px] text-slate-400">·</span>
                <p className="text-[10px] text-slate-300 font-mono truncate max-w-[200px]">{s?.deviceModel ?? dev.model ?? '—'}</p>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {!s ? (
            <div className="text-center py-8 text-slate-400 text-sm">
              Sin datos disponibles — escanea la red o sincroniza el AP para obtener información.
            </div>
          ) : (
            <>
              {/* ── SECCIÓN 1: Sistema / Host ── */}
              <M5Section title="Sistema (host)" icon={<Cpu className="w-3.5 h-3.5" />} colorClass="bg-blue-50 border-blue-200 text-blue-700">
                <M5Row label="hostname"   value={s.deviceName ?? dev.name} />
                <M5Row label="devmodel"   value={s.deviceModel ?? dev.model} />
                <M5Row label="fwversion"  value={s.firmwareVersion ?? dev.firmware} />
                <M5Row label="fwprefix"   value={s.fwPrefix} />
                <M5Row label="uptime"     value={s.uptimeStr} />
                <M5Row label="time"       value={s.deviceDate} />
                <M5Row label="cpuload"    value={s.cpuLoad != null ? `${s.cpuLoad}%` : null} />
                <M5Row label="loadavg"    value={s.loadAvg} />
                <M5Row label="netrole"    value={s.networkMode} />
                <M5Row label="memory total"   value={s.memTotalKb   != null ? `${Math.round(s.memTotalKb / 1024)} MB` : null} />
                <M5Row label="memory free"    value={s.memFreeKb    != null ? `${Math.round(s.memFreeKb  / 1024)} MB` : null} />
                <M5Row label="memory buffers" value={s.memBuffersKb != null ? `${Math.round(s.memBuffersKb / 1024)} MB` : null} />
                <M5Row label="memory cached"  value={s.memCachedKb  != null ? `${Math.round(s.memCachedKb  / 1024)} MB` : null} />
                <M5Row label="memory uso %"   value={s.memoryPercent != null ? `${s.memoryPercent}%` : null} />
                {/* AC extras */}
                {family === 'ac' && <M5Row label="temperature" value={s.temperature  != null ? `${s.temperature} °C` : null} />}
                {family === 'ac' && <M5Row label="height"      value={s.deviceHeight != null ? `${s.deviceHeight} m`  : null} />}
              </M5Section>

              {/* ── SECCIÓN 2: Inalámbrico ── */}
              <M5Section title="Inalámbrico (wireless)" icon={<Wifi className="w-3.5 h-3.5" />} colorClass="bg-sky-50 border-sky-200 text-sky-700">
                {/* Identificación */}
                <M5Row label="mode"        value={s.mode} />
                <M5Row label="essid"       value={s.essid ?? dev.essid} />
                <M5Row label="hide_essid"  value={s.hideSsid != null ? (s.hideSsid ? 'Oculto' : 'Visible') : null} />
                <M5Row label="security"    value={s.security} />
                <M5Row label="countrycode" value={s.countryCode} />
                <M5Row label="wlan mac"    value={s.wlanMac} />
                <M5Row label="apmac"       value={s.apMac} />
                {/* Señal RF */}
                <M5Row label="signal"      value={s.signal     != null ? `${s.signal} dBm`     : null} />
                <M5Row label="rssi"        value={s.rssi       != null ? `${s.rssi} dBm`       : null} />
                <M5Row label="noisefloor"  value={s.noiseFloor != null ? `${s.noiseFloor} dBm` : null} />
                <M5Row label="txpower"     value={s.txPower    != null ? `${s.txPower} dBm`    : null} />
                <M5Row label="antenna_gain" value={s.antennaGain != null ? `${s.antennaGain} dBi` : null} />
                <M5Row label="antenna"     value={s.antenna} />
                <M5Row label="distance"    value={s.distance   != null ? `${s.distance} m`     : null} />
                <M5Row label="ccq"         value={s.ccq        != null ? `${s.ccq}%`           : null} />
                {/* Cadenas RSSI */}
                {s.chainRssi && s.chainRssi.length > 0 && (
                  <M5Row label="chainrssi" value={s.chainRssi.map((v, i) => `Ch${i}: ${v} dBm`).join(' | ')} />
                )}
                {/* Frecuencia / Canal */}
                <M5Row label="frequency"   value={s.frequency     != null ? `${s.frequency} MHz`   : null} />
                <M5Row label="channel"     value={s.channelNumber != null ? String(s.channelNumber) : null} />
                <M5Row label="chanbw"      value={s.channelWidth  != null ? `${s.channelWidth} MHz` : null} />
                <M5Row label="chanbw_ext"  value={s.channelWidthExt} />
                <M5Row label="freq_range"  value={s.freqRange} />
                <M5Row label="opmode"      value={s.opmode} />
                {/* AC: frecuencia central, modulación, cadenas */}
                {family === 'ac' && <M5Row label="center1_freq"  value={s.centerFreq1 != null ? `${s.centerFreq1} MHz` : null} />}
                {family === 'ac' && <M5Row label="tx_idx"        value={s.txIdx       != null ? String(s.txIdx)        : null} />}
                {family === 'ac' && <M5Row label="rx_idx"        value={s.rxIdx       != null ? String(s.rxIdx)        : null} />}
                {family === 'ac' && <M5Row label="tx_nss"        value={s.txNss       != null ? String(s.txNss)        : null} />}
                {family === 'ac' && <M5Row label="rx_nss"        value={s.rxNss       != null ? String(s.rxNss)        : null} />}
                {family === 'ac' && <M5Row label="tx_chainmask"  value={s.txChainmask != null ? String(s.txChainmask)  : null} />}
                {family === 'ac' && <M5Row label="rx_chainmask"  value={s.rxChainmask != null ? String(s.rxChainmask)  : null} />}
                {family === 'ac' && s.chainNames && s.chainNames.length > 0 && (
                  <M5Row label="chain_names" value={s.chainNames.join(', ')} />
                )}
                {/* Rendimiento TX/RX */}
                <M5Row label="txrate"      value={s.txRate != null ? `${s.txRate} Mbps` : null} />
                <M5Row label="rxrate"      value={s.rxRate != null ? `${s.rxRate} Mbps` : null} />
                <M5Row label="chains"      value={s.chains} />
                {/* AirMAX */}
                <M5Row label="airMAX quality"    value={s.airmaxQuality  != null ? `${s.airmaxQuality}%`  : null} />
                <M5Row label="airMAX capacity"   value={s.airmaxCapacity != null ? `${s.airmaxCapacity}%` : null} />
                <M5Row label="airMAX priority"   value={s.airmaxPriority} />
                {/* AC: Polling / Airtime */}
                {family === 'ac' && <M5Row label="dcap"          value={s.dcap      != null ? `${s.dcap}%`      : null} />}
                {family === 'ac' && <M5Row label="ucap"          value={s.ucap      != null ? `${s.ucap}%`      : null} />}
                {family === 'ac' && <M5Row label="airtime total"  value={s.airtime   != null ? `${s.airtime}%`   : null} />}
                {family === 'ac' && <M5Row label="tx_airtime"    value={s.txAirtime != null ? `${s.txAirtime}%` : null} />}
                {family === 'ac' && <M5Row label="rx_airtime"    value={s.rxAirtime != null ? `${s.rxAirtime}%` : null} />}
                {family === 'ac' && <M5Row label="cinr"          value={s.cinr      != null ? `${s.cinr} dB`    : null} />}
                {family === 'ac' && <M5Row label="evm"           value={s.evm} />}
                {family === 'ac' && <M5Row label="tx_latency"    value={s.txLatency != null ? `${s.txLatency} ms` : null} />}
                {family === 'ac' && <M5Row label="fixed_frame"   value={s.fixedFrame != null ? (s.fixedFrame ? 'Sí' : 'No') : null} />}
                {family === 'ac' && <M5Row label="gps_sync"      value={s.gpsSync    != null ? (s.gpsSync    ? 'Sincronizado' : 'No') : null} />}
                {/* M5: extras de control */}
                {family === 'm5' && <M5Row label="airsync_mode"    value={s.airsyncMode} />}
                {family === 'm5' && <M5Row label="atpc_status"     value={s.atpcStatus} />}
                {family === 'm5' && <M5Row label="tx_retries"      value={s.txRetries      != null ? String(s.txRetries)      : null} />}
                {family === 'm5' && <M5Row label="missed_beacons"  value={s.missedBeacons  != null ? String(s.missedBeacons)  : null} />}
                {family === 'm5' && <M5Row label="rx_crypts"       value={s.rxCrypts       != null ? String(s.rxCrypts)       : null} />}
              </M5Section>

              {/* ── SECCIÓN 3: Interfaces físicas y lógicas ── */}
              <M5Section title="Interfaces físicas y lógicas" icon={<Network className="w-3.5 h-3.5" />} colorClass="bg-violet-50 border-violet-200 text-violet-700">
                {s.ifaceDetails && s.ifaceDetails.length > 0 ? (
                  s.ifaceDetails.map(ifc => <IfaceBlock key={ifc.ifname} ifc={ifc} />)
                ) : (
                  <>
                    <M5Row label="wlan (ath0)" value={s.wlanMac  ?? null} />
                    <M5Row label="eth0 (lan)"  value={s.lanMac   ?? null} />
                    <M5Row label="lan speed"   value={s.lanSpeed != null ? `${s.lanSpeed} Mbps` : null} />
                    <M5Row label="lan info"    value={s.lanInfo} />
                  </>
                )}
                {/* Tráfico por interfaz desde /proc/net/dev (SSH) */}
                {s.ifaceTraffic && Object.keys(s.ifaceTraffic).length > 0 && (
                  <div className="col-span-2 mt-2">
                    <p className="text-[9px] font-bold text-violet-600 uppercase mb-1">/proc/net/dev — Tráfico</p>
                    <div className="grid grid-cols-1 gap-1">
                      {Object.entries(s.ifaceTraffic).map(([iface, tr]) => (
                        <div key={iface} className="text-[9px] font-mono bg-white rounded p-1.5 border border-violet-100">
                          <span className="font-bold text-violet-700">{iface}:</span>{' '}
                          RX {(tr.rxBytes / 1024 / 1024).toFixed(1)} MB ({tr.rxPackets} pkts){' '}
                          | TX {(tr.txBytes / 1024 / 1024).toFixed(1)} MB ({tr.txPackets} pkts)
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {/* Rutas desde SSH */}
                {s._rawRoutes && (
                  <div className="col-span-2 mt-2">
                    <p className="text-[9px] font-bold text-violet-600 uppercase mb-1">route -n</p>
                    <pre className="text-[9px] font-mono bg-white rounded-lg p-2 overflow-x-auto whitespace-pre-wrap max-h-24 border border-violet-100">{s._rawRoutes}</pre>
                  </div>
                )}
              </M5Section>

              {/* ── SECCIÓN 4: Servicios y Gestión ── */}
              <M5Section title="Servicios y Gestión Remota" icon={<Shield className="w-3.5 h-3.5" />} colorClass="bg-emerald-50 border-emerald-200 text-emerald-700">
                <M5Row label="airMAX"          value={s.airmaxEnabled != null ? (s.airmaxEnabled ? 'Activado' : 'Desactivado') : null} />
                <M5Row label="airMAX priority" value={s.airmaxPriority} />
                {/* Raw sections (SSH only) */}
                {s._rawMcaCli && (
                  <div className="col-span-2 mt-2">
                    <p className="text-[9px] font-bold text-emerald-600 uppercase mb-1">mca-cli-op info</p>
                    <pre className="text-[9px] font-mono bg-white rounded-lg p-2 overflow-x-auto whitespace-pre-wrap max-h-28 border border-emerald-100">{s._rawMcaCli}</pre>
                  </div>
                )}
                {s._rawUname && (
                  <div className="col-span-2 mt-2">
                    <p className="text-[9px] font-bold text-emerald-600 uppercase mb-1">uname / uptime</p>
                    <pre className="text-[9px] font-mono bg-white rounded-lg p-2 overflow-x-auto whitespace-pre-wrap max-h-16 border border-emerald-100">{s._rawUname}</pre>
                  </div>
                )}
                {s._rawIwconfig && (
                  <div className="col-span-2 mt-2">
                    <p className="text-[9px] font-bold text-emerald-600 uppercase mb-1">iwconfig ath0</p>
                    <pre className="text-[9px] font-mono bg-white rounded-lg p-2 overflow-x-auto whitespace-pre-wrap max-h-28 border border-emerald-100">{s._rawIwconfig}</pre>
                  </div>
                )}
                {s._rawWstalist && (
                  <div className="col-span-2 mt-2">
                    <p className="text-[9px] font-bold text-emerald-600 uppercase mb-1">wstalist</p>
                    <pre className="text-[9px] font-mono bg-white rounded-lg p-2 overflow-x-auto whitespace-pre-wrap max-h-28 border border-emerald-100">{s._rawWstalist}</pre>
                  </div>
                )}
                {s._rawMeminfo && (
                  <div className="col-span-2 mt-2">
                    <p className="text-[9px] font-bold text-emerald-600 uppercase mb-1">/proc/meminfo</p>
                    <pre className="text-[9px] font-mono bg-white rounded-lg p-2 overflow-x-auto whitespace-pre-wrap max-h-28 border border-emerald-100">{s._rawMeminfo}</pre>
                  </div>
                )}
              </M5Section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
