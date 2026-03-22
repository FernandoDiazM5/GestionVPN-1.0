import { useState, useEffect, useCallback, useRef, Fragment, useMemo } from 'react';
import {
  Radio, Wifi, RefreshCw, Loader2, X,
  ChevronDown, ChevronRight, Eye, ExternalLink,
  AlertCircle, CheckCircle2, Activity, Clock,
  Database, Server, Users, ZapOff, WifiOff,
  Info, Columns, Search,
  Download, Upload, ScanSearch,
} from 'lucide-react';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';
import { API_BASE_URL } from '../config';
import { deviceDb } from '../store/deviceDb';
import { useVpn } from '../context/VpnContext';
import type { SavedDevice, AntennaStats } from '../types/devices';
import type { LiveCpe, PollResult, CpeDetail, KnownCpe } from '../types/apMonitor';

const POLL_MS = 30_000;
const BASE = `${API_BASE_URL}/api/ap-monitor`;
const LS_KEY = 'ap_monitor_cpe_cols';

// ── Helpers ───────────────────────────────────────────────────────────────
const fmtDbm = (v?: number | null) => v != null ? `${v} dBm` : '—';
const fmtPct = (v?: number | null) => v != null ? `${v}%` : '—';
const fmtKbps = (v?: number | null) => {
  if (v == null) return '—';
  return v >= 1000 ? `${(v / 1000).toFixed(1)} Mbps` : `${v} kbps`;
};
const fmtRate = (v?: number | null) => {
  if (v == null) return '—';
  return v >= 1000 ? `${(v / 1000).toFixed(0)} Mbps` : `${v} kbps`;
};
const sigColor = (v?: number | null) =>
  v == null ? 'text-slate-300' : v >= -65 ? 'text-emerald-600' : v >= -75 ? 'text-sky-600' : 'text-amber-500';
const ccqColor = (v?: number | null) =>
  v == null ? '' : v >= 80 ? 'text-emerald-600' : v >= 60 ? 'text-sky-600' : 'text-amber-500';
const fmtFw = (fw?: string) => {
  if (!fw) return null;
  const m = fw.match(/^([A-Z]+)\.?(v[\d.]+)/);
  return m ? `${m[2]} (${m[1]})` : fw;
};
const fmtUptime = (s?: string | null) => s || '—';
const fmtCpu = (v?: number | null) =>
  v == null ? '—' : `${v}%`;
const fmtMem = (totalKb?: number | null, freeKb?: number | null, pct?: number | null) => {
  if (pct != null) return `${pct}%`;
  if (totalKb && freeKb != null) {
    const used = ((totalKb - freeKb) / totalKb * 100).toFixed(0);
    return `${used}%`;
  }
  return '—';
};

// ── CPE column definitions ────────────────────────────────────────────────
interface ColDef { key: string; label: string; always?: boolean; width: string; right?: boolean; }
const CPE_COL_DEFS: ColDef[] = [
  { key: 'status', label: 'Estado', always: true, width: '28px' },
  { key: 'mac', label: 'MAC / Host', always: true, width: '130px' },
  { key: 'modelo', label: 'Modelo', width: '110px' },
  { key: 'nombre', label: 'Nombre Dispositivo', width: '140px' },
  { key: 'signal', label: 'Señal', width: '72px', right: true },
  { key: 'rssi', label: 'Remote Sig.', width: '72px', right: true },
  { key: 'noise', label: 'Noise', width: '72px', right: true },
  { key: 'cinr', label: 'CINR', width: '64px', right: true },
  { key: 'ccq', label: 'CCQ', width: '64px', right: true },
  { key: 'link_pot', label: 'Link Pot.', width: '60px', right: true },
  { key: 'tx_rate', label: '↓ Cap.', width: '60px', right: true },
  { key: 'rx_rate', label: '↑ Cap.', width: '62px', right: true },
  { key: 'air_tx', label: 'Air TX', width: '62px', right: true },
  { key: 'air_rx', label: 'Air RX', width: '62px', right: true },
  { key: 'thr_rx', label: 'Thr RX', width: '76px', right: true },
  { key: 'thr_tx', label: 'Thr TX', width: '76px', right: true },
  { key: 'uptime', label: 'Uptime', width: '100px' },
  { key: 'distance', label: 'Distancia', width: '66px', right: true },
  { key: 'lastip', label: 'Última IP', width: '100px' },
  { key: 'actions', label: 'Acciones', always: true, width: '72px' },
];
const DEFAULT_HIDDEN = new Set<string>(['noise', 'cinr', 'link_pot', 'thr_rx', 'thr_tx']);

function loadColPrefs(): Set<string> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return new Set(JSON.parse(raw));
  } catch { /* */ }
  return DEFAULT_HIDDEN;
}
function saveColPrefs(hidden: Set<string>) {
  try { localStorage.setItem(LS_KEY, JSON.stringify([...hidden])); } catch { /* */ }
}

// ── Node group ────────────────────────────────────────────────────────────
interface NodeGroup { nodeId: string; nodeName: string; aps: SavedDevice[]; }

// ── Column Selector Dropdown ──────────────────────────────────────────────
function ColSelector({ hidden, onChange }: {
  hidden: Set<string>;
  onChange: (h: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const toggleCol = (key: string) => {
    const next = new Set(hidden);
    if (next.has(key)) next.delete(key); else next.add(key);
    onChange(next);
  };

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold
          bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200 transition-colors">
        <Columns className="w-3.5 h-3.5" />
        COLUMNAS
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-50 bg-white border border-slate-200 rounded-xl shadow-xl p-3 w-56 max-h-80 overflow-y-auto">
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-2">Seleccionar columnas</p>
          {CPE_COL_DEFS.filter(c => !c.always).map(col => (
            <label key={col.key} className="flex items-center gap-2 py-1 cursor-pointer group">
              <input type="checkbox" checked={!hidden.has(col.key)} onChange={() => toggleCol(col.key)}
                className="w-3.5 h-3.5 rounded accent-indigo-600" />
              <span className="text-xs text-slate-700 group-hover:text-indigo-600">{col.label}</span>
            </label>
          ))}
          <button onClick={() => onChange(new Set())}
            className="mt-2 w-full text-[10px] text-indigo-600 hover:underline text-center">
            Mostrar todas
          </button>
        </div>
      )}
    </div>
  );
}

// ── CPE Detail Modal ──────────────────────────────────────────────────────
function CpeDetailModal({
  mac, apId, cpeIp, sshPort, sshUser, sshPass, onClose,
}: {
  mac: string; apId: string; cpeIp: string | null;
  sshPort: number; sshUser: string; sshPass: string;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<CpeDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!cpeIp) { setError('IP del CPE no disponible — esperando próximo poll'); return; }
    setLoading(true);
    fetchWithTimeout(`${BASE}/cpes/${mac}/detail-direct`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cpe_ip: cpeIp, port: sshPort, user: sshUser, pass: sshPass, apId }),
    }, 22_000)
      .then(r => r.json())
      .then(d => { if (d.success) setDetail(d.stats); else setError(d.message); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [mac, apId, cpeIp, sshPort, sshUser, sshPass]);

  const rows: Array<{ l: string; v: string | null | undefined; mono?: boolean; color?: string }> = detail ? [
    { l: 'Hostname', v: detail.deviceName },
    { l: 'Modelo', v: detail.deviceModel },
    { l: 'Firmware', v: fmtFw(detail.firmwareVersion) },
    { l: 'IP LAN', v: detail.ip, mono: true },
    { l: 'Modo', v: detail.mode },
    { l: 'Modo Red', v: detail.networkMode },
    { l: 'SSID AP', v: detail.essid },
    { l: 'Señal', v: fmtDbm(detail.signal), color: sigColor(detail.signal), mono: true },
    { l: 'Noise', v: fmtDbm(detail.noiseFloor), mono: true },
    { l: 'CCQ', v: fmtPct(detail.ccq), color: ccqColor(detail.ccq), mono: true },
    { l: 'TX Rate', v: fmtRate(detail.txRate ? detail.txRate * 1000 : null), mono: true },
    { l: 'TX Power', v: detail.txPower != null ? `${detail.txPower} dBm` : null, mono: true },
    { l: 'Canal', v: detail.channelWidth != null ? `${detail.channelWidth} MHz` : null, mono: true },
    { l: 'Frecuencia', v: detail.frequency != null ? `${detail.frequency} MHz` : null, mono: true },
    { l: 'WLAN MAC', v: detail.wlanMac, mono: true },
    { l: 'LAN MAC', v: detail.lanMac, mono: true },
    { l: 'AP MAC', v: detail.apMac, mono: true },
    { l: 'Seguridad', v: detail.security },
    { l: 'Uptime', v: detail.uptimeStr, mono: true },
  ].filter(r => r.v) as typeof rows : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm px-4 py-6 animate-in fade-in duration-200"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between bg-slate-800 rounded-t-2xl px-5 py-3 shrink-0">
          <div>
            <p className="text-xs font-bold text-white font-mono">{mac}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">{cpeIp || 'IP desconocida'} · Detalle CPE</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg"><X className="w-4 h-4" /></button>
        </div>
        <div className="overflow-y-auto p-5">
          {loading && (
            <div className="flex items-center justify-center gap-3 py-12 text-slate-400">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Conectando SSH al CPE…</span>
            </div>
          )}
          {error && !loading && (
            <div className="flex items-start gap-2 p-3 bg-rose-50 border border-rose-200 rounded-xl">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <p className="text-xs text-rose-600">{error}</p>
            </div>
          )}
          {detail && !loading && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {rows.map(row => (
                <div key={row.l} className="bg-slate-50 rounded-lg px-3 py-2 border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">{row.l}</p>
                  <p className={`text-sm font-bold truncate ${row.color ?? 'text-slate-800'} ${row.mono ? 'font-mono tracking-tight' : ''}`}>{row.v}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── AP Detail Modal ───────────────────────────────────────────────────────
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
    if (!dev.sshUser || !dev.sshPass) { setError('Sin credenciales SSH'); return; }
    setLoading(true); setError('');
    fetchWithTimeout(`${BASE}/ap-detail-direct`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ip: dev.ip, port: dev.sshPort ?? 22, user: dev.sshUser, pass: dev.sshPass }),
    }, 35_000)
      .then(r => r.json())
      .then(d => { if (d.success) { setStats(d.stats); setSaved(false); } else setError(d.message); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [dev]);

  useEffect(() => { if (!dev.cachedStats) refresh(); }, []);

  const handleSave = () => {
    if (!stats) return;
    onSave(stats);
    setSaved(true);
  };

  const s = stats;
  const memLabel = fmtMem(s?.memTotalKb, s?.memFreeKb, s?.memoryPercent);

  // Traffic rows from /proc/net/dev
  const trafficRows = s?.ifaceTraffic
    ? Object.entries(s.ifaceTraffic).filter(([, v]) => v.rxBytes > 0 || v.txBytes > 0)
    : [];

  const StatCard = ({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) => (
    <div className="bg-slate-50 rounded-lg px-3 py-2 border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-sm font-bold truncate font-mono tracking-tight ${color ?? 'text-slate-800'}`}>{value}</p>
      {sub && <p className="text-[10px] text-slate-500 truncate mt-0.5">{sub}</p>}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm px-4 py-6 animate-in fade-in duration-200"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between bg-slate-800 rounded-t-2xl px-5 py-3 shrink-0">
          <div>
            <p className="text-sm font-bold text-white">{dev.cachedStats?.deviceName ?? dev.name ?? dev.ip}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">{dev.ip} · Detalle completo del AP</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={refresh} disabled={loading}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg disabled:opacity-40">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            </button>
            <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg"><X className="w-4 h-4" /></button>
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto p-5 space-y-4">
          {error && (
            <div className="flex items-start gap-2 p-3 bg-rose-50 border border-rose-200 rounded-xl">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <p className="text-xs text-rose-600">{error}</p>
            </div>
          )}
          {loading && !s && (
            <div className="flex items-center justify-center gap-3 py-12 text-slate-400">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Conectando SSH al AP…</span>
            </div>
          )}

          {s && (
            <>
              {/* Sistema */}
              <div>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-2">Sistema</p>
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

              {/* Radio */}
              <div>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-2">Radio / Wireless</p>
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
                    color={s.airmaxEnabled ? 'text-emerald-600' : 'text-slate-400'} />}
                  {s.airmaxQuality != null && <StatCard label="AM Quality" value={`${s.airmaxQuality}%`} />}
                  {s.airmaxCapacity != null && <StatCard label="AM Capacity" value={`${s.airmaxCapacity}%`} />}
                </div>
              </div>

              {/* Señal (si aplica — modo station) */}
              {(s.signal != null || s.ccq != null) && (
                <div>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-2">Señal RF</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                    {s.signal != null && <StatCard label="Señal" value={fmtDbm(s.signal)} color={sigColor(s.signal)} />}
                    {s.noiseFloor != null && <StatCard label="Noise" value={fmtDbm(s.noiseFloor)} />}
                    {s.ccq != null && <StatCard label="CCQ" value={fmtPct(s.ccq)} color={ccqColor(s.ccq)} />}
                    {s.txRate != null && <StatCard label="TX Rate" value={`${s.txRate} Mbps`} />}
                    {s.rxRate != null && <StatCard label="RX Rate" value={`${s.rxRate} Mbps`} />}
                  </div>
                </div>
              )}

              {/* Tráfico por interfaz */}
              {trafficRows.length > 0 && (
                <div>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-2">Tráfico por Interfaz</p>
                  <div className="space-y-1">
                    {trafficRows.map(([iface, v]) => (
                      <div key={iface} className="flex items-center gap-4 bg-slate-50 rounded-lg px-3 py-2 border border-slate-100 text-xs">
                        <span className="font-mono font-bold text-slate-700 w-16 shrink-0">{iface}</span>
                        <span className="flex items-center gap-1 text-sky-700"><Download className="w-3 h-3" />
                          {(v.rxBytes / 1e6).toFixed(1)} MB RX
                        </span>
                        <span className="flex items-center gap-1 text-rose-600"><Upload className="w-3 h-3" />
                          {(v.txBytes / 1e6).toFixed(1)} MB TX
                        </span>
                        <span className="text-slate-400 text-[10px]">{v.rxPackets + v.txPackets} pkts</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {s && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 shrink-0 bg-slate-50 rounded-b-2xl">
            <p className="text-[10px] text-slate-400">Los datos de señal y tráfico son instantáneos y no se persisten</p>
            <button onClick={handleSave} disabled={saved}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all
                ${saved ? 'bg-emerald-100 text-emerald-700' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}>
              {saved ? <><CheckCircle2 className="w-3.5 h-3.5" /> Guardado</> : 'Guardar en dispositivo'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Known CPEs Modal ──────────────────────────────────────────────────────
function KnownCpesModal({ apId, onClose }: { apId: string; onClose: () => void }) {
  const [cpes, setCpes] = useState<KnownCpe[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchWithTimeout(`${BASE}/cpes`, {}, 10_000)
      .then(r => r.json())
      .then(d => { if (d.success) setCpes(d.cpes.filter((c: KnownCpe) => c.ap_id === apId)); })
      .catch(() => { })
      .finally(() => setLoading(false));
  }, [apId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm px-4 py-6 animate-in fade-in duration-200"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between bg-slate-800 rounded-t-2xl px-5 py-3 shrink-0">
          <p className="text-xs font-bold text-white">CPEs conocidos del AP</p>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg"><X className="w-4 h-4" /></button>
        </div>
        <div className="overflow-y-auto p-4">
          {loading && <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>}
          {!loading && cpes.length === 0 && <p className="text-sm text-slate-400 text-center py-8">Sin CPEs conocidos para este AP</p>}
          {!loading && cpes.length > 0 && (
            <div className="space-y-2">
              {cpes.map(c => (
                <div key={c.mac} className="bg-slate-50 rounded-xl p-3 border border-slate-100 grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                  <div><p className="text-[8px] font-bold text-slate-400 uppercase">Hostname</p><p className="font-semibold text-slate-700 truncate">{c.hostname || '—'}</p></div>
                  <div><p className="text-[8px] font-bold text-slate-400 uppercase">MAC</p><p className="font-mono text-slate-600 truncate">{c.mac}</p></div>
                  <div><p className="text-[8px] font-bold text-slate-400 uppercase">Modelo</p><p className="text-slate-600 truncate">{c.modelo || '—'}</p></div>
                  <div><p className="text-[8px] font-bold text-slate-400 uppercase">IP LAN</p><p className="font-mono text-slate-600">{c.ip_lan || '—'}</p></div>
                  <div><p className="text-[8px] font-bold text-slate-400 uppercase">SSID AP</p><p className="text-slate-600 truncate">{c.ssid_ap || '—'}</p></div>
                  <div><p className="text-[8px] font-bold text-slate-400 uppercase">Última vez</p><p className="text-slate-400">{c.ultima_vez_visto ? new Date(c.ultima_vez_visto).toLocaleString() : '—'}</p></div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── CPE Station Row ───────────────────────────────────────────────────────
function CpeRow({ cpe, idx, onDetail, visibleCols }: {
  cpe: LiveCpe; idx: number;
  onDetail: (mac: string, ip: string | null) => void;
  visibleCols: Set<string>;
}) {
  const show = (k: string) => !visibleCols.has(k);
  const snr = cpe.signal != null && cpe.noisefloor != null ? cpe.signal - cpe.noisefloor : null;
  const linkPotential = (cpe.tx_rate != null && cpe.rx_rate != null)
    ? fmtRate(cpe.tx_rate + cpe.rx_rate) : '—';

  const cols = CPE_COL_DEFS.filter(c => c.always || show(c.key));
  const gridCols = cols.map(c => c.width).join(' ');

  return (
    <div
      className={`grid items-center text-xs border-b border-slate-100 last:border-0 transition-colors
        ${idx % 2 === 0 ? 'bg-white hover:bg-slate-50/80' : 'bg-slate-50/50 hover:bg-slate-50'}`}
      style={{ gridTemplateColumns: gridCols }}>
      {/* status */}
      <div className="px-1.5 py-3 flex items-center justify-center">
        <span className="w-2 h-2 rounded-full bg-emerald-500" title="Conectado" />
      </div>
      {/* mac */}
      <div className="px-2 py-3 min-w-0">
        <p className="font-mono font-semibold text-slate-700 truncate text-xs">{cpe.mac}</p>
        {cpe.hostname && <p className="text-[9px] text-indigo-600 truncate font-medium">{cpe.hostname}</p>}
      </div>
      {/* modelo */}
      {show('modelo') && (
        <div className="px-2 py-3 min-w-0">
          <p className="text-slate-500 truncate">{cpe.modelo || <span className="text-slate-300">—</span>}</p>
        </div>
      )}
      {/* nombre */}
      {show('nombre') && (
        <div className="px-2 py-3 min-w-0">
          <p className={`truncate font-semibold ${cpe.isKnown ? 'text-slate-800' : 'text-slate-400 italic text-[10px]'}`}>
            {cpe.hostname || 'Sin nombre'}
          </p>
        </div>
      )}
      {/* signal */}
      {show('signal') && (
        <div className="px-2 py-3 text-right">
          <span className={`font-mono font-bold ${sigColor(cpe.signal)}`}>{fmtDbm(cpe.signal)}</span>
        </div>
      )}
      {/* rssi */}
      {show('rssi') && (
        <div className="px-2 py-2 text-right">
          <span className={`font-mono ${sigColor(cpe.rssi)}`}>{fmtDbm(cpe.rssi)}</span>
        </div>
      )}
      {/* noise */}
      {show('noise') && (
        <div className="px-2 py-2 text-right font-mono text-slate-500">{fmtDbm(cpe.noisefloor)}</div>
      )}
      {/* cinr */}
      {show('cinr') && (
        <div className="px-2 py-2 text-right font-mono text-slate-600">
          {cpe.cinr != null ? `${cpe.cinr} dB` : snr != null ? `${snr} dB` : '—'}
        </div>
      )}
      {/* ccq */}
      {show('ccq') && (
        <div className="px-2 py-2 text-right">
          <span className={`font-mono font-bold ${ccqColor(cpe.ccq)}`}>{fmtPct(cpe.ccq)}</span>
        </div>
      )}
      {/* link_pot */}
      {show('link_pot') && (
        <div className="px-2 py-2 text-right font-mono text-slate-600 text-[10px]">{linkPotential}</div>
      )}
      {/* tx_rate (↓ Cap) */}
      {show('tx_rate') && (
        <div className="px-2 py-2 text-right font-mono text-sky-700 font-semibold">{fmtRate(cpe.tx_rate)}</div>
      )}
      {/* rx_rate (↑ Cap) */}
      {show('rx_rate') && (
        <div className="px-2 py-2 text-right font-mono text-indigo-700 font-semibold">{fmtRate(cpe.rx_rate)}</div>
      )}
      {/* airtime_tx */}
      {show('air_tx') && (
        <div className="px-2 py-2 text-right font-mono text-amber-600">{fmtPct(cpe.airtime_tx)}</div>
      )}
      {/* airtime_rx */}
      {show('air_rx') && (
        <div className="px-2 py-2 text-right font-mono text-amber-600">{fmtPct(cpe.airtime_rx)}</div>
      )}
      {/* thr_rx */}
      {show('thr_rx') && (
        <div className="px-2 py-2 text-right font-mono text-emerald-700 font-semibold">{fmtKbps(cpe.throughputRxKbps)}</div>
      )}
      {/* thr_tx */}
      {show('thr_tx') && (
        <div className="px-2 py-2 text-right font-mono text-rose-600 font-semibold">{fmtKbps(cpe.throughputTxKbps)}</div>
      )}
      {/* uptime */}
      {show('uptime') && (
        <div className="px-2 py-2 font-mono text-slate-400 text-[10px] truncate">{fmtUptime(cpe.uptimeStr)}</div>
      )}
      {/* distance */}
      {show('distance') && (
        <div className="px-2 py-2 text-right font-mono text-slate-500">
          {cpe.distance != null ? `${cpe.distance} km` : '—'}
        </div>
      )}
      {/* lastip */}
      {show('lastip') && (
        <div className="px-2 py-2 font-mono text-[10px] text-slate-500 truncate">{cpe.lastip || '—'}</div>
      )}
      {/* actions */}
      <div className="px-2 py-2 flex items-center justify-end gap-0.5">
        <button onClick={() => onDetail(cpe.mac, cpe.lastip || null)} title="Ver detalle del CPE"
          className="p-1.5 text-indigo-500 hover:bg-indigo-50 rounded-lg transition-colors">
          <Eye className="w-3.5 h-3.5" />
        </button>
        {cpe.lastip && (
          <a href={`http://${cpe.lastip}`} target="_blank" rel="noopener noreferrer"
            title={`Abrir ${cpe.lastip}`}
            className="p-1.5 text-sky-500 hover:bg-sky-50 rounded-lg transition-colors flex items-center">
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>
    </div>
  );
}

// ── Station Table ─────────────────────────────────────────────────────────
function StationTable({ poll, onCpeDetail, dev }: {
  poll: PollResult;
  onCpeDetail: (mac: string, ip: string | null) => void;
  dev: SavedDevice;
}) {
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(loadColPrefs);
  const [cpeSearch, setCpeSearch] = useState('');
  const [enriching, setEnriching] = useState(false);
  const [enrichMsg, setEnrichMsg] = useState('');

  const handleColChange = (h: Set<string>) => { setHiddenCols(h); saveColPrefs(h); };

  const filtered = useMemo(() => {
    if (!cpeSearch.trim()) return poll.stations;
    const q = cpeSearch.toLowerCase();
    return poll.stations.filter(s =>
      s.mac.toLowerCase().includes(q) ||
      (s.hostname ?? '').toLowerCase().includes(q) ||
      (s.modelo ?? '').toLowerCase().includes(q) ||
      (s.lastip ?? '').includes(q)
    );
  }, [poll.stations, cpeSearch]);

  const needEnrich = poll.stations.filter(s => s.lastip && !s.isKnown);

  const handleEnrichAll = async () => {
    if (!dev.sshUser || !dev.sshPass || needEnrich.length === 0) return;
    setEnriching(true); setEnrichMsg('');
    try {
      const r = await fetchWithTimeout(`${BASE}/cpes/enrich-batch`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cpes: needEnrich.map(s => ({ mac: s.mac, ip: s.lastip })),
          port: dev.sshPort ?? 22,
          user: dev.sshUser,
          pass: dev.sshPass,
        }),
      }, 120_000);
      const d = await r.json();
      const ok = d.results?.filter((x: { ok: boolean }) => x.ok).length ?? 0;
      setEnrichMsg(`${ok}/${needEnrich.length} CPEs enriquecidos`);
    } catch (e) {
      setEnrichMsg(e instanceof Error ? e.message : 'Error');
    }
    setEnriching(false);
  };

  const visibleColDefs = CPE_COL_DEFS.filter(c => c.always || !hiddenCols.has(c.key));
  const gridCols = visibleColDefs.map(c => c.width).join(' ');
  const minW = visibleColDefs.reduce((a, c) => a + parseInt(c.width), 0);

  return (
    <div className="border-t border-indigo-100 bg-gradient-to-r from-indigo-50/40 to-slate-50/20">
      {/* Station list controls */}
      <div className="flex items-center justify-between flex-wrap gap-2 px-4 py-2 border-b border-indigo-100">
        <div className="flex items-center gap-2">
          {poll.loading && <Loader2 className="w-3 h-3 animate-spin text-indigo-400" />}
          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
            Station List · {poll.stations.length} CPE{poll.stations.length !== 1 ? 's' : ''}
          </span>
          {poll.error && <span className="text-[9px] text-rose-500 font-medium">{poll.error}</span>}
          {enrichMsg && <span className="text-[9px] text-emerald-600 font-medium">{enrichMsg}</span>}
        </div>
        <div className="flex items-center gap-2">
          {/* Search CPEs */}
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
            <input
              value={cpeSearch} onChange={e => setCpeSearch(e.target.value)}
              placeholder="Buscar CPE…"
              className="pl-6 pr-2 py-1 text-[11px] border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300 w-36"
            />
            {cpeSearch && <button onClick={() => setCpeSearch('')} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X className="w-3 h-3" /></button>}
          </div>
          {/* Enrich button */}
          {needEnrich.length > 0 && (
            <button onClick={handleEnrichAll} disabled={enriching}
              title={`SSH a ${needEnrich.length} CPE(s) para obtener nombre/modelo`}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold
                bg-violet-50 text-violet-600 hover:bg-violet-100 border border-violet-200 transition-colors disabled:opacity-50">
              {enriching ? <Loader2 className="w-3 h-3 animate-spin" /> : <ScanSearch className="w-3 h-3" />}
              {enriching ? 'Enriching…' : `Enrich ${needEnrich.length}`}
            </button>
          )}
          {/* Column selector */}
          <ColSelector hidden={hiddenCols} onChange={handleColChange} />
          {poll.polledAt > 0 && (
            <span className="text-[9px] text-slate-300 font-mono">
              {new Date(poll.polledAt).toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

      {poll.stations.length === 0 && !poll.loading && (
        <div className="flex items-center justify-center gap-2 py-6 text-slate-400">
          <ZapOff className="w-4 h-4" />
          <span className="text-xs">{poll.error ? 'Error en poll SSH' : 'Sin CPEs conectados'}</span>
        </div>
      )}

      {poll.stations.length > 0 && (
        <div className="overflow-x-auto">
          <div style={{ minWidth: `${minW}px` }}>
            {/* Headers */}
            <div className="grid bg-slate-100 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider"
              style={{ gridTemplateColumns: gridCols }}>
              {visibleColDefs.map(col => (
                <div key={col.key} className={`px-2 py-2.5 ${col.right ? 'text-right' : ''}`}>{col.label}</div>
              ))}
            </div>
            {filtered.map((cpe, idx) => (
              <CpeRow key={cpe.mac} cpe={cpe} idx={idx} onDetail={onCpeDetail} visibleCols={hiddenCols} />
            ))}
            {filtered.length === 0 && cpeSearch && (
              <div className="text-center py-4 text-xs text-slate-400">Sin resultados para "{cpeSearch}"</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── AP Row ────────────────────────────────────────────────────────────────
function ApRow({ dev, pollResult, expanded, onToggle, onKnownCpes, onCpeDetail, onDetail }: {
  dev: SavedDevice;
  pollResult?: PollResult;
  expanded: boolean;
  onToggle: () => void;
  onKnownCpes: () => void;
  onCpeDetail: (mac: string, ip: string | null) => void;
  onDetail: () => void;
}) {
  const stats = dev.cachedStats;
  const name = stats?.deviceName ?? dev.deviceName ?? dev.name;
  const ssid = stats?.essid ?? dev.essid;
  const freq = stats?.frequency ?? dev.frequency;
  const freqGhz = freq ? `${(freq / 1000).toFixed(1)} GHz` : null;
  const model = stats?.deviceModel ?? dev.model;
  const firmware = stats?.firmwareVersion ?? dev.firmware;
  const channel = stats?.channelWidth ?? dev.channelWidth;
  const txPower = stats?.txPower;
  const netMode = stats?.networkMode ?? dev.networkMode;
  const noSsh = !dev.sshUser || !dev.sshPass;
  const isPolling = pollResult?.loading ?? false;
  const cpeCount = pollResult?.stations.length ?? null;
  const hasError = !!pollResult?.error;

  return (
    <Fragment>
      <div className="grid items-center px-4 py-3 border-b border-slate-100 hover:bg-slate-50 transition-colors"
        style={{ gridTemplateColumns: '68px minmax(0,1fr) 120px 130px 110px 60px 56px auto' }}>

        {/* Modo / Frec */}
        <div>
          <span className="inline-flex text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-indigo-100 text-indigo-700">AP</span>
          {freqGhz && <p className="text-[9px] font-bold text-sky-600 mt-0.5">{freqGhz}</p>}
          {netMode && <p className="text-[8px] text-slate-400 truncate">{netMode}</p>}
        </div>

        {/* Nombre / MAC */}
        <div className="min-w-0 pr-2">
          <p className="text-sm font-semibold text-slate-800 truncate" title={name || dev.ip}>{name || dev.ip}</p>
          <p className="font-mono text-[9px] text-slate-400 truncate">{dev.ip}</p>
        </div>

        {/* Modelo / Firmware */}
        <div className="min-w-0 pr-2">
          {model && <p className="text-xs text-slate-600 truncate" title={model}>{model}</p>}
          {firmware && <p className="text-[9px] text-slate-400 truncate">{fmtFw(firmware)}</p>}
        </div>

        {/* SSID / Canal */}
        <div className="min-w-0 pr-2">
          {ssid
            ? <p className="font-mono text-xs text-slate-700 truncate" title={ssid}>{ssid}</p>
            : <span className="text-[10px] text-slate-300">—</span>}
          {channel && <p className="text-[9px] text-slate-400">{channel} MHz</p>}
        </div>

        {/* TX Power */}
        <div className="text-center">
          {txPower != null
            ? <span className="text-xs font-mono font-bold text-indigo-600">{txPower} dBm</span>
            : <span className="text-slate-300 text-xs">—</span>}
        </div>

        {/* CPE count badge */}
        <div className="flex items-center justify-center">
          {cpeCount != null ? (
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold
              ${expanded ? 'bg-indigo-600 text-white' : 'bg-violet-100 text-violet-700'}`}>
              <Users className="w-2.5 h-2.5" />
              {cpeCount}
            </span>
          ) : (
            <span className="text-slate-300 text-xs">—</span>
          )}
        </div>

        {/* Estado poll */}
        <div className="flex items-center justify-center">
          {isPolling
            ? <Loader2 className="w-3 h-3 animate-spin text-indigo-400" />
            : hasError
              ? <span className="w-2 h-2 rounded-full bg-amber-400" title={pollResult?.error} />
              : cpeCount != null
                ? <span className="w-2 h-2 rounded-full bg-emerald-500" title="Online" />
                : <span className="w-2 h-2 rounded-full bg-slate-300" title="Sin poll" />}
        </div>

        {/* Acciones */}
        <div className="flex items-center gap-0.5">
          {noSsh ? (
            <span className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200">
              <WifiOff className="w-3 h-3" /><span>Sin SSH</span>
            </span>
          ) : (
            <button onClick={onToggle}
              title={expanded ? 'Ocultar CPEs' : 'Ver CPEs en tiempo real'}
              className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-bold transition-all
                ${expanded
                  ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                  : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border border-indigo-200'}`}>
              {isPolling
                ? <Loader2 className="w-3 h-3 animate-spin" />
                : expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              <span>CPEs</span>
            </button>
          )}
          <button onClick={onDetail} title="Detalle completo del AP"
            className="p-1.5 text-sky-500 hover:bg-sky-50 rounded-lg transition-colors">
            <Info className="w-3.5 h-3.5" />
          </button>
          <a href={`http://${dev.ip}`} target="_blank" rel="noopener noreferrer"
            title={`Abrir ${dev.ip}`}
            className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg transition-colors flex items-center">
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <button onClick={onKnownCpes} title="Ver CPEs conocidos (guardados)"
            className="p-1.5 text-violet-500 hover:bg-violet-50 rounded-lg transition-colors">
            <Database className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {expanded && pollResult && (
        <StationTable poll={pollResult} onCpeDetail={onCpeDetail} dev={dev} />
      )}
    </Fragment>
  );
}

// ── AP Group Card ─────────────────────────────────────────────────────────
function ApGroupCard({ group, expandedAps, pollResults, onToggleAp, onKnownCpes, onCpeDetail, onApDetail }: {
  group: NodeGroup;
  expandedAps: Set<string>;
  pollResults: Record<string, PollResult>;
  onToggleAp: (apId: string) => void;
  onKnownCpes: (apId: string) => void;
  onCpeDetail: (mac: string, ip: string | null, dev: SavedDevice) => void;
  onApDetail: (dev: SavedDevice) => void;
}) {
  const [expanded, setExpanded] = useState(true);

  const anyPolled = group.aps.some(ap => (pollResults[ap.id]?.polledAt ?? 0) > 0);
  const anyError = group.aps.some(ap => !!pollResults[ap.id]?.error);
  const anyPolling = group.aps.some(ap => pollResults[ap.id]?.loading);
  const statusColor = group.aps.length === 0 ? 'bg-slate-300'
    : anyPolled && !anyError ? 'bg-emerald-500'
      : anyError ? 'bg-amber-400'
        : anyPolling ? 'bg-sky-400 animate-pulse'
          : 'bg-slate-300';
  const statusLabel = group.aps.length === 0 ? 'Sin APs'
    : anyPolled && !anyError ? 'Online'
      : anyError ? 'Parcial'
        : anyPolling ? 'Conectando…'
          : 'Sin datos';
  const totalCpes = group.aps.reduce((s, ap) => s + (pollResults[ap.id]?.stations.length ?? 0), 0);

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-3.5 bg-slate-50 border-b border-slate-100">
        <button onClick={() => setExpanded(e => !e)}
          className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Radio className="w-4 h-4 text-indigo-500 shrink-0" />
          <span className="font-bold text-slate-800">{group.nodeName}</span>
          <div className="flex items-center gap-1.5 ml-2">
            <span className={`w-2 h-2 rounded-full ${statusColor}`} />
            <span className="text-[10px] font-bold text-slate-500">{statusLabel}</span>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-500 shrink-0">
          <span className="flex items-center gap-1"><Server className="w-3 h-3" /> {group.aps.length} AP{group.aps.length !== 1 ? 's' : ''}</span>
          {totalCpes > 0 && <span className="flex items-center gap-1"><Users className="w-3 h-3 text-violet-500" /> {totalCpes} CPEs</span>}
        </div>
      </div>

      {expanded && (
        <>
          {group.aps.length === 0 && (
            <div className="flex flex-col items-center py-10 gap-3 text-slate-400">
              <Wifi className="w-8 h-8" />
              <p className="text-sm">No hay APs con rol "ap" en este nodo</p>
            </div>
          )}
          {group.aps.length > 0 && (
            <>
              <div className="grid bg-slate-50 border-b border-slate-200 text-[9px] font-bold text-slate-400 uppercase tracking-wider px-4 py-2"
                style={{ gridTemplateColumns: '68px minmax(0,1fr) 120px 130px 110px 60px 56px auto' }}>
                <span>Modo</span>
                <span>Nombre / IP</span>
                <span>Modelo</span>
                <span>SSID / Canal</span>
                <span className="text-center">TX Pwr</span>
                <span className="text-center">CPEs</span>
                <span className="text-center">Estado</span>
                <span className="text-right">Acciones</span>
              </div>
              {group.aps.map(dev => (
                <ApRow
                  key={dev.id}
                  dev={dev}
                  pollResult={pollResults[dev.id]}
                  expanded={expandedAps.has(dev.id)}
                  onToggle={() => onToggleAp(dev.id)}
                  onKnownCpes={() => onKnownCpes(dev.id)}
                  onCpeDetail={(mac, ip) => onCpeDetail(mac, ip, dev)}
                  onDetail={() => onApDetail(dev)}
                />
              ))}
            </>
          )}
        </>
      )}
    </div>
  );
}

// ── Main Module ───────────────────────────────────────────────────────────
export default function ApMonitorModule() {
  const { nodes } = useVpn();
  const [devices, setDevices] = useState<SavedDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedAps, setExpandedAps] = useState<Set<string>>(new Set());
  const [pollResults, setPollResults] = useState<Record<string, PollResult>>({});
  const [toast, setToast] = useState('');
  const [apSearch, setApSearch] = useState('');

  // Modals
  const [cpeDetailTarget, setCpeDetailTarget] = useState<{
    mac: string; apId: string; ip: string | null;
    sshPort: number; sshUser: string; sshPass: string;
  } | null>(null);
  const [knownCpesApId, setKnownCpesApId] = useState<string | null>(null);
  const [apDetailDev, setApDetailDev] = useState<SavedDevice | null>(null);

  const pollTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const expandedApsRef = useRef(expandedAps);
  const devicesRef = useRef(devices);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const autoPolledRef = useRef(false);

  useEffect(() => { expandedApsRef.current = expandedAps; }, [expandedAps]);
  useEffect(() => { devicesRef.current = devices; }, [devices]);

  const showToast = (msg: string) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 4000);
  };

  // Node groups (only role==='ap')
  const nodeGroups: NodeGroup[] = useMemo(() => {
    const apDevices = devices.filter(d => d.role === 'ap');
    const map = new Map<string, NodeGroup>();
    for (const d of apDevices) {
      if (!map.has(d.nodeId)) map.set(d.nodeId, { nodeId: d.nodeId, nodeName: nodes.find(n => n.id === d.nodeId)?.nombre_nodo || d.nodeName, aps: [] });
      map.get(d.nodeId)!.aps.push(d);
    }
    return [...map.values()];
  }, [devices, nodes]);

  // Filtered node groups by search
  const filteredGroups: NodeGroup[] = useMemo(() => {
    if (!apSearch.trim()) return nodeGroups;
    const q = apSearch.toLowerCase();
    return nodeGroups.map(g => ({
      ...g,
      aps: g.aps.filter(d =>
        (d.cachedStats?.deviceName ?? d.name ?? '').toLowerCase().includes(q) ||
        (d.ip || '').toLowerCase().includes(q) ||
        (d.model ?? '').toLowerCase().includes(q) ||
        (d.cachedStats?.essid ?? d.essid ?? '').toLowerCase().includes(q)
      ),
    })).filter(g => g.aps.length > 0);
  }, [nodeGroups, apSearch]);

  const loadDevices = useCallback(async () => {
    setLoading(true);
    try {
      const devs = await deviceDb.load();
      setDevices(devs);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadDevices(); }, [loadDevices]);

  // ── Poll a single AP ─────────────────────────────────────────────────
  const pollApDirect = useCallback(async (apId: string) => {
    const dev = devicesRef.current.find(d => d.id === apId);
    if (!dev) return;

    setPollResults(prev => ({
      ...prev,
      [apId]: { ...(prev[apId] ?? { stations: [] }), loading: true, polledAt: prev[apId]?.polledAt ?? 0 },
    }));

    try {
      const res = await fetchWithTimeout(`${BASE}/poll-direct`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apId,
          ip: dev.ip,
          port: dev.sshPort ?? 22,
          user: dev.sshUser ?? '',
          pass: dev.sshPass ?? '',
          saveHistory: false,
        }),
      }, 20_000);
      const data = await res.json();
      if (data.success) {
        setPollResults(prev => ({ ...prev, [apId]: { stations: data.stations || [], polledAt: data.polledAt, loading: false } }));
      } else {
        setPollResults(prev => ({ ...prev, [apId]: { ...(prev[apId] ?? { stations: [] }), loading: false, error: data.message } }));
      }
    } catch (e) {
      setPollResults(prev => ({
        ...prev,
        [apId]: { ...(prev[apId] ?? { stations: [] }), loading: false, error: e instanceof Error ? e.message : 'Error SSH' },
      }));
    }

    // Schedule next poll only if expanded
    if (expandedApsRef.current.has(apId)) {
      pollTimers.current[apId] = setTimeout(() => pollApDirect(apId), POLL_MS);
    } else {
      delete pollTimers.current[apId];
    }
  }, []);

  // ── AUTO-POLL on load (fix "Inactivo") ───────────────────────────────
  // When devices load, silently poll each AP once to determine online status.
  // The station table stays collapsed; this just updates pollResults[apId].
  useEffect(() => {
    if (devices.length === 0 || autoPolledRef.current) return;
    autoPolledRef.current = true;
    const apDevices = devices.filter(d => d.role === 'ap' && d.sshUser && d.sshPass);
    apDevices.forEach((dev, i) => {
      // Stagger 600ms between each to avoid SSH flood
      setTimeout(() => pollApDirect(dev.id), i * 600);
    });
  }, [devices, pollApDirect]);

  // Start/stop polling loops when expandedAps changes
  useEffect(() => {
    expandedAps.forEach(apId => {
      if (!pollTimers.current[apId]) pollApDirect(apId);
    });
    Object.keys(pollTimers.current).forEach(apId => {
      if (!expandedAps.has(apId)) { clearTimeout(pollTimers.current[apId]); delete pollTimers.current[apId]; }
    });
  }, [expandedAps, pollApDirect]);

  // Cleanup on unmount
  useEffect(() => () => { Object.values(pollTimers.current).forEach(clearTimeout); }, []);

  const toggleAp = (apId: string) => {
    setExpandedAps(prev => {
      const next = new Set(prev);
      if (next.has(apId)) next.delete(apId); else next.add(apId);
      return next;
    });
  };

  // Save AP detail stats back to the SavedDevice
  const handleSaveApDetail = async (dev: SavedDevice, newStats: AntennaStats) => {
    const updated: SavedDevice = { ...dev, cachedStats: { ...(dev.cachedStats ?? {}), ...newStats } };
    await deviceDb.saveSingle(updated);
    setDevices(prev => prev.map(d => d.id === dev.id ? updated : d));
    showToast('Datos del AP guardados');
  };

  const totalAps = nodeGroups.reduce((s, g) => s + g.aps.length, 0);
  const totalCpes = Object.values(pollResults).reduce((s, r) => s + r.stations.length, 0);

  return (
    <div className="space-y-5">
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-slate-800 text-white text-sm font-semibold px-5 py-3 rounded-2xl shadow-xl pointer-events-none">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toast}</span>
        </div>
      )}

      {/* Header */}
      <div className="card p-6 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Activity className="w-5 h-5 text-indigo-500" />
            <span>Monitor de APs</span>
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            Monitoreo en tiempo real — APs de la pestaña Equipos, agrupados por nodo
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="text-right text-sm text-slate-500">
            <span className="font-bold text-indigo-600">{nodeGroups.length}</span> nodos ·{' '}
            <span className="font-bold text-indigo-600">{totalAps}</span> APs ·{' '}
            <span className="font-bold text-violet-600">{totalCpes}</span> CPEs live
          </div>
          {/* AP Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              value={apSearch} onChange={e => setApSearch(e.target.value)}
              placeholder="Buscar AP…"
              className="pl-8 pr-8 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 w-44"
            />
            {apSearch && <button onClick={() => setApSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X className="w-3.5 h-3.5" /></button>}
          </div>
          <button onClick={() => { autoPolledRef.current = false; loadDevices(); }} disabled={loading}
            className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors disabled:opacity-50"
            title="Recargar lista de equipos">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 px-1 text-[10px] text-slate-400">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Online</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400" /> Parcial / Errores</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-sky-400" /> Conectando…</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-300" /> Sin datos</span>
        <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Poll cada 30s (expandido)</span>
        <span className="flex items-center gap-1"><Info className="w-3 h-3 text-sky-500" /> Detalle AP (SSH completo)</span>
        <span className="flex items-center gap-1"><Database className="w-3 h-3" /> CPEs conocidos (guardados)</span>
        <span className="flex items-center gap-1"><ScanSearch className="w-3 h-3 text-violet-500" /> Enrich: obtiene nombre/modelo de CPEs vía SSH</span>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
      )}

      {/* Empty */}
      {!loading && nodeGroups.length === 0 && (
        <div className="card border-dashed border-2 border-slate-200 py-16 flex flex-col items-center text-center gap-4">
          <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center">
            <Radio className="w-7 h-7 text-indigo-400" />
          </div>
          <div>
            <p className="text-slate-500 font-medium">Sin APs guardados</p>
            <p className="text-slate-400 text-sm mt-1">
              Ve a la pestaña <strong>Escanear</strong>, agrega dispositivos con rol "AP" y vuelve aquí para monitorearlos.
            </p>
          </div>
        </div>
      )}

      {/* Node groups */}
      {!loading && filteredGroups.map(group => (
        <ApGroupCard
          key={group.nodeId}
          group={group}
          expandedAps={expandedAps}
          pollResults={pollResults}
          onToggleAp={toggleAp}
          onKnownCpes={apId => setKnownCpesApId(apId)}
          onCpeDetail={(mac, ip, dev) => {
            if (!dev) return;
            setCpeDetailTarget({
              mac,
              apId: dev.id,
              ip,
              sshPort: dev.sshPort ?? 22,
              sshUser: dev.sshUser ?? '',
              sshPass: dev.sshPass ?? '',
            });
          }}
          onApDetail={dev => setApDetailDev(dev)}
        />
      ))}

      {/* Modals */}
      {cpeDetailTarget && (
        <CpeDetailModal
          mac={cpeDetailTarget.mac}
          apId={cpeDetailTarget.apId}
          cpeIp={cpeDetailTarget.ip}
          sshPort={cpeDetailTarget.sshPort}
          sshUser={cpeDetailTarget.sshUser}
          sshPass={cpeDetailTarget.sshPass}
          onClose={() => setCpeDetailTarget(null)}
        />
      )}

      {knownCpesApId && (
        <KnownCpesModal apId={knownCpesApId} onClose={() => setKnownCpesApId(null)} />
      )}

      {apDetailDev && (
        <ApDetailModal
          dev={apDetailDev}
          onClose={() => setApDetailDev(null)}
          onSave={stats => {
            if (apDetailDev) {
              handleSaveApDetail(apDetailDev, stats);
              setApDetailDev(null);
            }
          }}
        />
      )}
    </div>
  );
}
