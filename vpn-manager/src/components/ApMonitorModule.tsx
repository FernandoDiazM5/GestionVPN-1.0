import React, { useState, useEffect, useCallback, useRef, Fragment, useMemo } from 'react';
import {
  Radio, Wifi, RefreshCw, Loader2, X,
  ChevronDown, ChevronRight, Eye, ExternalLink,
  AlertCircle, CheckCircle2, Activity, Clock,
  Server, Users, ZapOff, WifiOff,
  Columns, Search, Trash2,
  Download, Upload, ScanSearch, ArrowRightLeft,
  AlertTriangle,
} from 'lucide-react';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';
import DeviceCard from './DeviceCard';
import M5FullInfoModal from './M5FullInfoModal';
import { API_BASE_URL } from '../config';
import { deviceDb } from '../store/deviceDb';
import { useVpn } from '../context/VpnContext';
import type { SavedDevice, AntennaStats } from '../types/devices';
import type { LiveCpe, PollResult, CpeDetail } from '../types/apMonitor';
import type { NodeInfo } from '../types/api';

const LS_POLL_INTERVAL_KEY = 'vpn_ap_poll_ms';
const BASE = `${API_BASE_URL}/api/ap-monitor`;
const LS_KEY = 'ap_monitor_cpe_cols';

// ── Helpers ───────────────────────────────────────────────────────────────
const fmtDbm = (v?: number | null) => v != null ? `${v} dBm` : '—';
const fmtPct = (v?: number | null) => v != null ? `${v}%` : '—';
const fmtKbps = (v?: number | null) => {
  if (v == null) return '—';
  return v >= 1000 ? `${(v / 1000).toFixed(1)} Mbps` : `${v} kbps`;
};
// tx_rate / rx_rate vienen en Mbps directamente del parser de ap.service.js
const fmtMbps = (v?: number | null) => {
  if (v == null) return '—';
  return `${Number(v).toFixed(1)} Mbps`;
};
// Alias para no romper referencias existentes
const _fmtRate = fmtMbps; void _fmtRate;
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
  { key: 'mac', label: 'MAC / Host', always: true, width: '150px' },
  { key: 'modelo', label: 'Modelo', width: '120px' },
  { key: 'nombre', label: 'Nombre Disp.', width: '140px' },
  { key: 'signal', label: 'Señal AP', width: '72px', right: true },
  { key: 'rssi', label: 'Señal CPE', width: '72px', right: true },
  { key: 'noise', label: 'Noise', width: '72px', right: true },
  { key: 'cinr', label: 'CINR', width: '64px', right: true },
  { key: 'ccq', label: 'CCQ', width: '64px', right: true },
  { key: 'tx_rate', label: '↓ TX Rate', width: '80px', right: true },
  { key: 'rx_rate', label: '↑ RX Rate', width: '80px', right: true },
  { key: 'am_qual', label: 'AM Qual', width: '66px', right: true },
  { key: 'am_cap', label: 'AM Cap', width: '66px', right: true },
  { key: 'am_dcap', label: 'DL Cap', width: '72px', right: true },
  { key: 'am_ucap', label: 'UL Cap', width: '72px', right: true },
  { key: 'air_tx', label: 'Air TX %', width: '62px', right: true },
  { key: 'air_rx', label: 'Air RX %', width: '62px', right: true },
  { key: 'thr_rx', label: 'Thr ↓', width: '80px', right: true },
  { key: 'thr_tx', label: 'Thr ↑', width: '80px', right: true },
  { key: 'uptime', label: 'Uptime', width: '100px' },
  { key: 'distance', label: 'Dist (m)', width: '66px', right: true },
  { key: 'lastip', label: 'Última IP', width: '108px' },
  { key: 'actions', label: 'Acciones', always: true, width: '72px' },
];
const DEFAULT_HIDDEN = new Set<string>(['noise', 'cinr', 'am_qual', 'am_cap', 'am_dcap', 'am_ucap', 'air_tx', 'air_rx', 'thr_rx', 'thr_tx']);

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
interface NodeGroup { nodeId: string; nodeName: string; aps: SavedDevice[]; stas: SavedDevice[]; }

// Estado de AP amarrado al túnel VPN, no al campo d.is_active de la BD
type ApStatus = 'online' | 'partial' | 'inactive' | 'connecting';

function getApStatus(
  d: SavedDevice,
  pollResults: Record<string, PollResult>,
  activeNodeName: string | null,
  tunnelActive: boolean,
): ApStatus {
  const belongsToActiveNode = !!activeNodeName && d.nodeName === activeNodeName;
  if (!tunnelActive || !belongsToActiveNode) {
    const r = pollResults[d.id];
    if (r && (r.stations.length > 0 || r.polledAt > 0)) return 'partial';
    return 'inactive';
  }
  const r = pollResults[d.id];
  if (!r) return 'inactive';
  if (r.loading && !r.polledAt) return 'connecting';
  if (r.error) return r.stations.length > 0 ? 'partial' : 'inactive';
  if (r.stations.length > 0) return 'online';
  return 'partial';
}

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

// ── Shared Subcomponents ───────────────────────────────────────────────────
function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-slate-50 rounded-lg px-3 py-2 border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-sm font-bold truncate font-mono tracking-tight ${color ?? 'text-slate-800'}`}>{value}</p>
      {sub && <p className="text-[10px] text-slate-500 truncate mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Device Card Modal (Estado / Ficha — modo compacto) ───────────────────
function DeviceCardModal({ device, onClose, onRemove, onUpdate }: {
  device: SavedDevice; onClose: () => void;
  onRemove?: () => void; onUpdate?: (updated: SavedDevice) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm px-4 py-6 animate-in fade-in duration-200"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between bg-slate-800 rounded-t-2xl px-4 py-2.5">
          <span className="text-xs font-bold text-slate-300">Detalle del dispositivo</span>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <DeviceCard
          device={device}
          onRemove={onRemove ? () => { onRemove(); onClose(); } : undefined}
          onUpdate={onUpdate}
        />
      </div>
    </div>
  );
}

// ── Move to Node Modal ────────────────────────────────────────────────────
function MoveToNodeModal({ device, nodes, knownNames, onConfirm, onClose }: {
  device: SavedDevice;
  nodes: NodeInfo[];
  knownNames: string[];
  onConfirm: (nodeId: string, nodeName: string) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null);

  // Build option list: live nodes first, then known names not already covered
  const options: { id: string; name: string }[] = [
    ...nodes.map(n => ({ id: n.id, name: n.nombre_nodo })),
    ...knownNames
      .filter(name => !nodes.some(n => n.nombre_nodo === name))
      .map(name => ({ id: name, name })),
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm px-4 animate-in fade-in duration-200"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4 animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <ArrowRightLeft className="w-4 h-4 text-indigo-500" />
              Mover a nodo
            </h3>
            <p className="text-xs text-slate-400 mt-0.5 truncate max-w-[220px]">{device.name || device.ip} · actual: <span className="font-medium">{device.nodeName}</span></p>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
          {options.length === 0 && (
            <p className="text-xs text-slate-400 text-center py-6">
              Sin nodos disponibles.<br />Conéctate al MikroTik para cargar los nodos.
            </p>
          )}
          {options.map(opt => (
            <button key={opt.id} onClick={() => setSelected(opt)}
              className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-medium border transition-all
                ${selected?.id === opt.id
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : opt.name === device.nodeName
                    ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-default'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-indigo-50 hover:border-indigo-300'}`}
              disabled={opt.name === device.nodeName}>
              {opt.name}
              {opt.name === device.nodeName && <span className="ml-2 text-[10px] opacity-60">(nodo actual)</span>}
            </button>
          ))}
        </div>

        <div className="flex gap-2 pt-1">
          <button onClick={onClose}
            className="flex-1 px-4 py-2 rounded-xl text-sm font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors">
            Cancelar
          </button>
          <button
            onClick={() => selected && selected.name !== device.nodeName && onConfirm(selected.id, selected.name)}
            disabled={!selected || selected.name === device.nodeName}
            className="flex-1 px-4 py-2 rounded-xl text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            Mover
          </button>
        </div>
      </div>
    </div>
  );
}

// ── AP Column definitions ─────────────────────────────────────────────────
interface ApColDef { key: string; label: string; always?: boolean; width: string; right?: boolean; }
const AP_COL_DEFS: ApColDef[] = [
  { key: 'modo', label: 'Modo', always: true, width: '72px' },
  { key: 'nombre', label: 'Nombre / IP', always: true, width: 'minmax(120px,1fr)' },
  { key: 'modelo', label: 'Modelo', width: '130px' },
  { key: 'ssid', label: 'SSID / Canal', width: '140px' },
  { key: 'signal', label: 'Señal', width: '72px', right: true },
  { key: 'ccq', label: 'CCQ', width: '60px', right: true },
  { key: 'txpwr', label: 'TX Pwr', width: '72px', right: true },
  { key: 'uptime', label: 'Uptime', width: '96px' },
  { key: 'cpu', label: 'CPU', width: '56px', right: true },
  { key: 'cpes', label: 'CPEs', always: true, width: '64px' },
  { key: 'estado', label: '', always: true, width: '32px' },
  { key: 'actions', label: 'Acciones', always: true, width: '230px' },
];
const AP_DEFAULT_HIDDEN = new Set<string>(['signal', 'ccq', 'uptime', 'cpu']);
const AP_LS_KEY = 'ap_monitor_ap_cols_v1';

function loadApColPrefs(): Set<string> {
  try { const raw = localStorage.getItem(AP_LS_KEY); if (raw) return new Set(JSON.parse(raw)); } catch { /* */ }
  return AP_DEFAULT_HIDDEN;
}
function saveApColPrefs(hidden: Set<string>) {
  try { localStorage.setItem(AP_LS_KEY, JSON.stringify([...hidden])); } catch { /* */ }
}

function ApColSelector({ hidden, onChange }: { hidden: Set<string>; onChange: (h: Set<string>) => void; }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  const toggle = (key: string) => {
    const next = new Set(hidden);
    if (next.has(key)) next.delete(key); else next.add(key);
    onChange(next);
  };
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold
          bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200 transition-colors">
        <Columns className="w-3 h-3" />
        COLS AP
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-50 bg-white border border-slate-200 rounded-xl shadow-xl p-3 w-48 max-h-72 overflow-y-auto">
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-2">Columnas de APs</p>
          {AP_COL_DEFS.filter(c => !c.always).map(col => (
            <label key={col.key} className="flex items-center gap-2 py-1 cursor-pointer group">
              <input type="checkbox" checked={!hidden.has(col.key)} onChange={() => toggle(col.key)}
                className="w-3.5 h-3.5 rounded accent-indigo-600" />
              <span className="text-xs text-slate-700 group-hover:text-indigo-600">{col.label}</span>
            </label>
          ))}
          <button onClick={() => onChange(new Set())}
            className="mt-2 w-full text-[10px] text-indigo-600 hover:underline text-center">Mostrar todas</button>
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
  // Credential override form — shown when SSH auth fails
  const [showCredForm, setShowCredForm] = useState(false);
  const [credUser, setCredUser] = useState('ubnt');
  const [credPass, setCredPass] = useState('');
  const [credPort, setCredPort] = useState(String(sshPort ?? 22));
  const [savingCreds, setSavingCreds] = useState(false);

  const isAuthError = (msg: string) =>
    /authentication|auth.*failed|configured.*method|credencial/i.test(msg);

  const fetchDetail = (overrideUser?: string, overridePass?: string, overridePort?: string) => {
    if (!cpeIp) { setError('IP del CPE no disponible — esperando próximo poll'); return; }
    setLoading(true);
    setError('');
    setDetail(null);
    fetchWithTimeout(`${BASE}/cpes/${mac}/detail-direct`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cpe_ip: cpeIp,
        port: parseInt(overridePort ?? credPort) || sshPort,
        user: overrideUser ?? sshUser,
        pass: overridePass ?? sshPass,
        apId,
      }),
    }, 25_000)
      .then(r => r.json())
      .then(d => {
        if (d.success) { setDetail(d.stats); setShowCredForm(false); }
        else {
          setError(d.message);
          if (isAuthError(d.message)) setShowCredForm(true);
        }
      })
      .catch(e => { setError(e.message); if (isAuthError(e.message)) setShowCredForm(true); })
      .finally(() => setLoading(false));
  };

  // Auto-fetch on mount
  useEffect(() => { 
    const timer = setTimeout(() => fetchDetail(), 0);
    return () => clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCredSubmit = async (evt: React.FormEvent) => {
    evt.preventDefault();
    if (!credUser) return;
    // Save credentials to backend first so they persist for future opens
    setSavingCreds(true);
    try {
      await fetchWithTimeout(`${BASE}/cpes/${mac}/credentials`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: credUser, pass: credPass, port: parseInt(credPort) || 22 }),
      }, 5_000);
    } catch { /* non-fatal — still attempt the connection */ }
    setSavingCreds(false);
    fetchDetail(credUser, credPass, credPort);
  };

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
    { l: 'TX Rate', v: fmtMbps(detail.txRate), mono: true },
    { l: 'RX Rate', v: fmtMbps(detail.rxRate), mono: true },
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
        <div className="overflow-y-auto p-5 space-y-4">
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
          {/* Credential form — appears automatically on auth failure */}
          {showCredForm && !loading && (
            <form onSubmit={handleCredSubmit} className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
              <p className="text-xs font-semibold text-amber-800">Credenciales SSH del CPE</p>
              <p className="text-[10px] text-amber-600">
                Las credenciales del CPE son independientes de las del AP.
                Los equipos Ubiquiti usan por defecto <span className="font-mono">ubnt / ubnt</span>.
              </p>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-1">
                  <label className="block text-[10px] font-semibold text-slate-500 mb-1">Usuario</label>
                  <input
                    className="w-full px-2 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-400"
                    value={credUser} onChange={e => setCredUser(e.target.value)}
                    placeholder="ubnt" autoComplete="off"
                  />
                </div>
                <div className="col-span-1">
                  <label className="block text-[10px] font-semibold text-slate-500 mb-1">Contrasena</label>
                  <input type="password"
                    className="w-full px-2 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-400"
                    value={credPass} onChange={e => setCredPass(e.target.value)}
                    placeholder="ubnt" autoComplete="current-password"
                  />
                </div>
                <div className="col-span-1">
                  <label className="block text-[10px] font-semibold text-slate-500 mb-1">Puerto SSH</label>
                  <input type="number"
                    className="w-full px-2 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-400"
                    value={credPort} onChange={e => setCredPort(e.target.value)}
                    placeholder="22" min={1} max={65535}
                  />
                </div>
              </div>
              <button type="submit" disabled={savingCreds || !credUser}
                className="w-full py-1.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-2">
                {savingCreds ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                Conectar y guardar credenciales
              </button>
            </form>
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

  // Traffic rows from /proc/net/dev
  const trafficRows = s?.ifaceTraffic
    ? Object.entries(s.ifaceTraffic).filter(([, v]) => v.rxBytes > 0 || v.txBytes > 0)
    : [];

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

// ── CPE Station Row ───────────────────────────────────────────────────────
function CpeRow({ cpe, idx, onDetail, hiddenCols, gridCols }: {
  cpe: LiveCpe; idx: number;
  onDetail: (mac: string, ip: string | null) => void;
  hiddenCols: Set<string>;
  gridCols: string;
}) {
  const show = (k: string) => !hiddenCols.has(k);

  // CINR: preferir airmax_cinr_rx, fallback a cálculo SNR
  const snr = cpe.signal != null && cpe.noisefloor != null ? cpe.signal - cpe.noisefloor : null;
  const cinrVal = cpe.airmax_cinr_rx ?? snr;

  // Nombre efectivo: remote_hostname > cpe_name > hostname del DB
  const displayName = cpe.remote_hostname || cpe.cpe_name || cpe.hostname || null;
  // Modelo efectivo: cpe_product (wstalist) > modelo (DB)
  const displayModel = cpe.cpe_product || cpe.modelo || null;
  // Badge de firmware
  const ff = cpe.firmware_family;

  return (
    <div
      className={`grid items-center text-xs border-b border-slate-100 last:border-0 transition-colors
        ${idx % 2 === 0 ? 'bg-white hover:bg-slate-50/80' : 'bg-slate-50/50 hover:bg-slate-50'}`}
      style={{ gridTemplateColumns: gridCols }}>

      {/* status */}
      <div className="px-1.5 py-3 flex items-center justify-center">
        <span className="w-2 h-2 rounded-full bg-emerald-500" title="Conectado" />
      </div>

      {/* mac + hostname + badge firmware */}
      <div className="px-2 py-2 min-w-0">
        <div className="flex items-center gap-1 min-w-0">
          <p className="font-mono font-semibold text-slate-700 truncate text-[10px]">{cpe.mac}</p>
          {ff && (
            <span className={`shrink-0 text-[7px] font-bold px-1 py-0.5 rounded
              ${ff === 'AC' ? 'bg-sky-100 text-sky-700' : 'bg-amber-100 text-amber-700'}`}>
              {ff}
            </span>
          )}
        </div>
        {displayName && <p className="text-[9px] text-indigo-600 truncate font-medium">{displayName}</p>}
      </div>

      {/* modelo */}
      {show('modelo') && (
        <div className="px-2 py-2 min-w-0">
          <p className="text-[10px] text-slate-600 truncate">{displayModel || <span className="text-slate-300">—</span>}</p>
        </div>
      )}

      {/* nombre dispositivo */}
      {show('nombre') && (
        <div className="px-2 py-2 min-w-0">
          {displayName
            ? <p className="truncate font-semibold text-slate-800 text-[10px]">{displayName}</p>
            : <p className="text-slate-300 italic text-[9px]">Sin nombre</p>}
        </div>
      )}

      {/* Señal AP side */}
      {show('signal') && (
        <div className="px-2 py-2 text-right">
          <span className={`font-mono font-bold text-xs ${sigColor(cpe.signal)}`}>{fmtDbm(cpe.signal)}</span>
        </div>
      )}

      {/* Señal CPE side (remote_signal) */}
      {show('rssi') && (
        <div className="px-2 py-2 text-right">
          <span className={`font-mono text-xs ${sigColor(cpe.remote_signal)}`}>{fmtDbm(cpe.remote_signal)}</span>
        </div>
      )}

      {/* Noise */}
      {show('noise') && (
        <div className="px-2 py-2 text-right font-mono text-slate-500 text-xs">{fmtDbm(cpe.noisefloor)}</div>
      )}

      {/* CINR */}
      {show('cinr') && (
        <div className="px-2 py-2 text-right font-mono text-slate-600 text-xs">
          {cinrVal != null ? `${cinrVal} dB` : '—'}
        </div>
      )}

      {/* CCQ */}
      {show('ccq') && (
        <div className="px-2 py-2 text-right">
          <span className={`font-mono font-bold text-xs ${ccqColor(cpe.ccq)}`}>{fmtPct(cpe.ccq)}</span>
        </div>
      )}

      {/* TX Rate ↓ (AP→CPE, Mbps) */}
      {show('tx_rate') && (
        <div className="px-2 py-2 text-right font-mono text-sky-700 font-semibold text-xs">{fmtMbps(cpe.tx_rate)}</div>
      )}

      {/* RX Rate ↑ (CPE→AP, Mbps) */}
      {show('rx_rate') && (
        <div className="px-2 py-2 text-right font-mono text-indigo-700 font-semibold text-xs">{fmtMbps(cpe.rx_rate)}</div>
      )}

      {/* AirMax M5 Quality */}
      {show('am_qual') && (
        <div className="px-2 py-2 text-right font-mono text-emerald-700 text-xs">
          {cpe.airmax_quality != null ? `${cpe.airmax_quality}%` : '—'}
        </div>
      )}

      {/* AirMax M5 Capacity */}
      {show('am_cap') && (
        <div className="px-2 py-2 text-right font-mono text-emerald-600 text-xs">
          {cpe.airmax_capacity != null ? `${cpe.airmax_capacity}%` : '—'}
        </div>
      )}

      {/* AirMax AC Downlink Cap */}
      {show('am_dcap') && (
        <div className="px-2 py-2 text-right font-mono text-cyan-700 font-semibold text-xs">
          {cpe.airmax_dcap != null ? `${cpe.airmax_dcap} Mbps` : '—'}
        </div>
      )}

      {/* AirMax AC Uplink Cap */}
      {show('am_ucap') && (
        <div className="px-2 py-2 text-right font-mono text-cyan-600 font-semibold text-xs">
          {cpe.airmax_ucap != null ? `${cpe.airmax_ucap} Mbps` : '—'}
        </div>
      )}

      {/* Airtime TX % */}
      {show('air_tx') && (
        <div className="px-2 py-2 text-right font-mono text-amber-600 text-xs">
          {fmtPct(cpe.airmax_tx_usage)}
        </div>
      )}

      {/* Airtime RX % */}
      {show('air_rx') && (
        <div className="px-2 py-2 text-right font-mono text-amber-600 text-xs">
          {fmtPct(cpe.airmax_rx_usage)}
        </div>
      )}

      {/* Throughput RX ↓ */}
      {show('thr_rx') && (
        <div className="px-2 py-2 text-right font-mono text-emerald-700 font-semibold text-xs">{fmtKbps(cpe.throughputRxKbps)}</div>
      )}

      {/* Throughput TX ↑ */}
      {show('thr_tx') && (
        <div className="px-2 py-2 text-right font-mono text-rose-600 font-semibold text-xs">{fmtKbps(cpe.throughputTxKbps)}</div>
      )}

      {/* Uptime */}
      {show('uptime') && (
        <div className="px-2 py-2 font-mono text-slate-400 text-[10px] truncate">{fmtUptime(cpe.uptimeStr)}</div>
      )}

      {/* Distancia en metros */}
      {show('distance') && (
        <div className="px-2 py-2 text-right font-mono text-slate-500 text-xs">
          {cpe.distance != null ? `${cpe.distance} m` : '—'}
        </div>
      )}

      {/* Última IP */}
      {show('lastip') && (
        <div className="px-2 py-2 font-mono text-[10px] text-slate-500 truncate">{cpe.lastip || '—'}</div>
      )}

      {/* Acciones */}
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
      (s.remote_hostname ?? '').toLowerCase().includes(q) ||
      (s.cpe_name ?? '').toLowerCase().includes(q) ||
      (s.cpe_product ?? '').toLowerCase().includes(q) ||
      (s.modelo ?? '').toLowerCase().includes(q) ||
      (s.lastip ?? '').includes(q)
    );
  }, [poll.stations, cpeSearch]);

  // Solo pide Enrich SSH si el CPE no tiene nombre en DB ni desde wstalist
  const needEnrich = poll.stations.filter(s =>
    s.lastip && !s.isKnown && !s.remote_hostname && !s.cpe_name
  );

  const handleEnrichAll = async () => {
    if (!dev.sshUser || (!dev.sshPass && !dev.hasSshPass) || needEnrich.length === 0) return;
    setEnriching(true); setEnrichMsg('');
    try {
      const r = await fetchWithTimeout(`${BASE}/cpes/enrich-batch`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cpes: needEnrich.map(s => ({ mac: s.mac, ip: s.lastip })),
          apId: dev.id,
          port: dev.sshPort ?? 22,
          user: dev.sshUser,
          pass: dev.sshPass ?? '',
        }),
      }, 120_000);
      const d = await r.json();
      const ok = d.results?.filter((x: { ok: boolean }) => x.ok).length ?? 0;
      setEnrichMsg(`${ok}/${needEnrich.length} CPEs enriquecidos`);
      setTimeout(() => setEnrichMsg(''), 5000);
    } catch (e) {
      setEnrichMsg(e instanceof Error ? e.message : 'Error');
      setTimeout(() => setEnrichMsg(''), 5000);
    }
    setEnriching(false);
  };

  const visibleColDefs = useMemo(
    () => CPE_COL_DEFS.filter(c => c.always || !hiddenCols.has(c.key)),
    [hiddenCols]
  );
  const gridCols = useMemo(() => visibleColDefs.map(c => c.width).join(' '), [visibleColDefs]);
  // F5: parseInt falla con anchos no-px (ej: minmax, auto) → fallback 100px
  const minW = useMemo(
    () => visibleColDefs.reduce((a, c) => { const px = parseInt(c.width); return a + (isNaN(px) ? 100 : px); }, 0),
    [visibleColDefs]
  );

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
              <CpeRow key={cpe.mac} cpe={cpe} idx={idx} onDetail={onCpeDetail} hiddenCols={hiddenCols} gridCols={gridCols} />
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
const ApRow = React.memo(function ApRow({ dev, pollResult, expanded, hiddenApCols, onToggle, onCpeDetail, onM5Detail, onView, onSync, onDelete, onMove }: {
  dev: SavedDevice;
  pollResult?: PollResult;
  expanded: boolean;
  hiddenApCols: Set<string>;
  onToggle: () => void;
  onCpeDetail: (mac: string, ip: string | null) => void;
  onM5Detail: () => void;
  onView: () => void;
  onSync: () => void;
  onDelete: () => void;
  onMove: () => void;
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
  const noSsh = !dev.sshUser || (dev.sshPass === undefined && !dev.hasSshPass);
  const isPolling = pollResult?.loading ?? false;
  const cpeCount = pollResult?.stations.length ?? null;
  const lastCount = dev.lastCpeCount ?? null;
  const displayCount = cpeCount ?? lastCount;
  const isHistorical = cpeCount === null && lastCount !== null;
  const hasError = !!pollResult?.error;

  const showAp = (key: string) => !hiddenApCols.has(key);
  const visibleApCols = AP_COL_DEFS.filter(c => c.always || showAp(c.key));
  const gridCols = visibleApCols.map(c => c.width).join(' ');

  return (
    <Fragment>
      <div className="grid items-center px-4 py-3 border-b border-slate-100 hover:bg-slate-50 transition-colors"
        style={{ gridTemplateColumns: gridCols }}>

        {/* Modo / Frec */}
        <div>
          <span className="inline-flex text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-indigo-100 text-indigo-700">AP</span>
          {freqGhz && <p className="text-[9px] font-bold text-sky-600 mt-0.5">{freqGhz}</p>}
          {netMode && <p className="text-[8px] text-slate-400 truncate">{netMode}</p>}
        </div>

        {/* Nombre / IP */}
        <div className="min-w-0 pr-2">
          <p className="text-sm font-semibold text-slate-800 truncate" title={name || dev.ip}>{name || dev.ip}</p>
          <p className="font-mono text-[9px] text-slate-400 truncate">{dev.ip}</p>
        </div>

        {/* Modelo / Firmware */}
        {showAp('modelo') && (
          <div className="min-w-0 pr-2">
            {model && <p className="text-xs text-slate-600 truncate" title={model}>{model}</p>}
            {firmware && <p className="text-[9px] text-slate-400 truncate">{fmtFw(firmware)}</p>}
          </div>
        )}

        {/* SSID / Canal */}
        {showAp('ssid') && (
          <div className="min-w-0 pr-2">
            {ssid
              ? <p className="font-mono text-xs text-slate-700 truncate" title={ssid}>{ssid}</p>
              : <span className="text-[10px] text-slate-300">—</span>}
            {channel && <p className="text-[9px] text-slate-400">{channel} MHz</p>}
          </div>
        )}

        {/* Señal */}
        {showAp('signal') && (
          <div className="text-right pr-2">
            <span className={`font-mono font-bold text-xs ${sigColor(stats?.signal)}`}>{fmtDbm(stats?.signal)}</span>
          </div>
        )}

        {/* CCQ */}
        {showAp('ccq') && (
          <div className="text-right pr-2">
            <span className={`font-mono font-bold text-xs ${ccqColor(stats?.ccq)}`}>{fmtPct(stats?.ccq)}</span>
          </div>
        )}

        {/* TX Power */}
        {showAp('txpwr') && (
          <div className="text-right pr-2">
            {txPower != null
              ? <span className="text-xs font-mono font-bold text-indigo-600">{txPower} dBm</span>
              : <span className="text-slate-300 text-xs">—</span>}
          </div>
        )}

        {/* Uptime */}
        {showAp('uptime') && (
          <div className="min-w-0 pr-2 overflow-hidden">
            <span className="font-mono text-[10px] text-slate-400 truncate block">{fmtUptime(stats?.uptimeStr)}</span>
          </div>
        )}

        {/* CPU */}
        {showAp('cpu') && (
          <div className="text-right pr-2">
            <span className="font-mono text-xs text-slate-500">{fmtCpu(stats?.cpuLoad)}</span>
          </div>
        )}

        {/* CPE count badge */}
        <div className="flex items-center justify-center">
          {displayCount != null ? (
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold
              ${expanded ? 'bg-indigo-600 text-white'
                : isHistorical ? 'bg-slate-100 text-slate-400'
                  : 'bg-violet-100 text-violet-700'}`}
              title={isHistorical && dev.lastCpeCountAt
                ? `Última sync: ${new Date(dev.lastCpeCountAt).toLocaleString()}`
                : undefined}>
              <Users className="w-2.5 h-2.5" />
              {displayCount}
              {isHistorical && <span className="text-[8px] opacity-60">*</span>}
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
        <div className="flex items-center gap-0.5 pl-1">
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
          <button onClick={onView} title="Estado / Ficha del equipo"
            className="p-1.5 text-indigo-500 hover:bg-indigo-50 rounded-lg transition-colors">
            <Eye className="w-3.5 h-3.5" />
          </button>
          <button onClick={onSync} title="Sincronizar ahora" disabled={isPolling}
            className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors disabled:opacity-40">
            {isPolling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          </button>
          <button onClick={onM5Detail} title="Ver estado completo del dispositivo (airOS)"
            className="flex items-center space-x-1 px-2 py-1.5 rounded-lg text-[11px] font-bold bg-violet-50 text-violet-600 hover:bg-violet-100 border border-violet-200 transition-colors">
            <Activity className="w-2.5 h-2.5" />
            <span>Informe</span>
          </button>
          <a href={`http://${dev.ip}`} target="_blank" rel="noopener noreferrer"
            title={`Abrir ${dev.ip}`}
            className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg transition-colors flex items-center">
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <button onClick={onMove} title="Mover a otro nodo"
            className="p-1.5 text-indigo-400 hover:bg-indigo-50 rounded-lg transition-colors">
            <ArrowRightLeft className="w-3.5 h-3.5" />
          </button>
          <button onClick={onDelete} title="Eliminar equipo"
            className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {expanded && pollResult && (
        <StationTable poll={pollResult} onCpeDetail={onCpeDetail} dev={dev} />
      )}
    </Fragment>
  );
});

// ── AP Group Card ─────────────────────────────────────────────────────────
function ApGroupCard({ group, expandedAps, pollResults, activeNodeName, tunnelActive, onToggleAp, onCpeDetail, onApDetail: _onApDetail, onM5Detail, onApView, onApSync, onApDelete, onApMove }: {
  group: NodeGroup;
  expandedAps: Set<string>;
  pollResults: Record<string, PollResult>;
  activeNodeName: string | null;
  tunnelActive: boolean;
  onToggleAp: (apId: string) => void;
  onCpeDetail: (mac: string, ip: string | null, dev: SavedDevice) => void;
  onApDetail: (dev: SavedDevice) => void;
  onM5Detail: (dev: SavedDevice) => void;
  onApView: (dev: SavedDevice) => void;
  onApSync: (apId: string) => void;
  onApDelete: (dev: SavedDevice) => void;
  onApMove: (dev: SavedDevice) => void;
}) {
  const [expanded, setExpanded] = useState(() => {
    try {
      const saved = sessionStorage.getItem('apMonitor_expanded_' + group.nodeId);
      if (saved !== null) return saved === 'true';
    } catch(e) {}
    return true;
  });
  useEffect(() => {
    sessionStorage.setItem('apMonitor_expanded_' + group.nodeId, String(expanded));
  }, [expanded, group.nodeId]);
  const [hiddenApCols, setHiddenApCols] = useState<Set<string>>(loadApColPrefs);
  const handleApColChange = (h: Set<string>) => { setHiddenApCols(h); saveApColPrefs(h); };

  // Calcular estado del grupo derivando el estado de cada AP individualmente
  const apStatuses = group.aps.map(ap => getApStatus(ap, pollResults, activeNodeName, tunnelActive));
  const anyOnline = apStatuses.some(s => s === 'online');
  const anyPartial = apStatuses.some(s => s === 'partial');
  const anyConnecting = apStatuses.some(s => s === 'connecting');
  const statusColor = group.aps.length === 0 ? 'bg-slate-300'
    : anyOnline ? 'bg-emerald-500'
      : anyPartial ? 'bg-amber-400'
        : anyConnecting ? 'bg-sky-400 animate-pulse'
          : 'bg-slate-300';
  const statusLabel = group.aps.length === 0 ? 'Sin APs'
    : anyOnline ? 'Online'
      : anyPartial ? 'Parcial'
        : anyConnecting ? 'Conectando…'
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
          {group.stas.length > 0 && <span className="flex items-center gap-1 text-cyan-600"><Users className="w-3 h-3" /> {group.stas.length} CPE{group.stas.length !== 1 ? 's' : ''}</span>}
          {totalCpes > 0 && <span className="flex items-center gap-1"><Users className="w-3 h-3 text-violet-500" /> {totalCpes} live</span>}
          <ApColSelector hidden={hiddenApCols} onChange={handleApColChange} />
        </div>
      </div>

      {expanded && (
        <>
          {group.aps.length === 0 && group.stas.length === 0 && (
            <div className="flex flex-col items-center py-10 gap-3 text-slate-400">
              <Wifi className="w-8 h-8" />
              <p className="text-sm">No hay APs guardados en este nodo</p>
            </div>
          )}
          {group.aps.length > 0 && (
            <div className="overflow-x-auto">
              {(() => {
                const visibleCols = AP_COL_DEFS.filter(c => c.always || !hiddenApCols.has(c.key));
                const gridCols = visibleCols.map(c => c.width).join(' ');
                const minW = visibleCols.reduce((a, c) => {
                  const m = c.width.match(/(\d+)px/);
                  return a + (m ? parseInt(m[1]) : 120);
                }, 0);
                return (
                  <div style={{ minWidth: `${minW}px` }}>
                    <div className="grid bg-slate-50 border-b border-slate-200 text-[9px] font-bold text-slate-400 uppercase tracking-wider px-4 py-2"
                      style={{ gridTemplateColumns: gridCols }}>
                      {visibleCols.map(col => (
                        <span key={col.key} className={`truncate ${col.right ? 'text-right pr-2' : col.key === 'cpes' || col.key === 'estado' ? 'text-center' : col.key === 'actions' ? 'text-right' : ''}`}>
                          {col.label}
                        </span>
                      ))}
                    </div>
                    {group.aps.map(dev => (
                      <ApRow
                        key={dev.id}
                        dev={dev}
                        pollResult={pollResults[dev.id]}
                        expanded={expandedAps.has(dev.id)}
                        hiddenApCols={hiddenApCols}
                        onToggle={() => onToggleAp(dev.id)}
                        onCpeDetail={(mac, ip) => onCpeDetail(mac, ip, dev)}
                        onM5Detail={() => onM5Detail(dev)}
                        onView={() => onApView(dev)}
                        onSync={() => onApSync(dev.id)}
                        onDelete={() => onApDelete(dev)}
                        onMove={() => onApMove(dev)}
                      />
                    ))}
                  </div>
                );
              })()}
            </div>
          )}

          {/* STAs guardados (role === 'sta') del grupo */}
          {group.stas.length > 0 && (
            <div className="border-t border-cyan-100 bg-cyan-50/30">
              <div className="px-4 py-2 flex items-center gap-2 border-b border-cyan-100">
                <span className="text-[9px] font-bold text-cyan-600 uppercase tracking-wider">CPEs guardados · {group.stas.length}</span>
              </div>
              {group.stas.map(sta => (
                <div key={sta.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-cyan-100/60 last:border-0 hover:bg-cyan-50 transition-colors text-xs">
                  <span className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-cyan-100 text-cyan-700 border border-cyan-200">CPE</span>
                  <span className="font-semibold text-slate-700 truncate min-w-0 max-w-[160px]" title={sta.name || sta.ip}>{sta.name || sta.ip}</span>
                  <span className="font-mono text-[10px] text-slate-400 shrink-0">{sta.ip}</span>
                  {sta.mac && <span className="font-mono text-[10px] text-slate-400 shrink-0 hidden sm:block">{sta.mac}</span>}
                  {sta.model && <span className="text-[10px] text-slate-500 truncate shrink-0 hidden md:block">{sta.model}</span>}
                  {sta.nodeName && <span className="text-[10px] text-indigo-400 truncate shrink-0 hidden lg:block">{sta.nodeName}</span>}
                  <button onClick={() => onApDelete(sta)} title="Eliminar CPE guardado"
                    className="ml-auto p-1.5 text-rose-400 hover:bg-rose-50 rounded-lg transition-colors shrink-0">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Main Module ───────────────────────────────────────────────────────────
export default function ApMonitorModule() {
  const { nodes, activeNodeVrf, tunnelExpiry } = useVpn();
  const tunnelActive = activeNodeVrf !== null && tunnelExpiry !== null && tunnelExpiry > Date.now();
  const activeNode = useMemo(() => nodes.find(n => n.nombre_vrf === activeNodeVrf) ?? null, [nodes, activeNodeVrf]);
  const activeNodeName = activeNode?.nombre_nodo ?? null;
  const [devices, setDevices] = useState<SavedDevice[]>([]);
  const [pollInterval, setPollInterval] = useState<number>(() => {
    const saved = localStorage.getItem(LS_POLL_INTERVAL_KEY);
    return saved ? parseInt(saved, 10) : 30_000;
  });
  const pollIntervalRef = useRef(pollInterval);
  const [loading, setLoading] = useState(true);
  const [expandedAps, setExpandedAps] = useState<Set<string>>(() => {
    try {
      const saved = sessionStorage.getItem('apMonitorExpandedAps');
      if (saved) return new Set(JSON.parse(saved));
    } catch(e) {}
    return new Set();
  });
  useEffect(() => {
    sessionStorage.setItem('apMonitorExpandedAps', JSON.stringify([...expandedAps]));
  }, [expandedAps]);
  const [pollResults, setPollResults] = useState<Record<string, PollResult>>(() => {
    try {
      const saved = sessionStorage.getItem('apMonitorPollResults');
      if (saved) return JSON.parse(saved);
    } catch(e) {}
    return {};
  });
  useEffect(() => {
    sessionStorage.setItem('apMonitorPollResults', JSON.stringify(pollResults));
  }, [pollResults]);
  const pollResultsRef = useRef(pollResults);
  useEffect(() => { pollResultsRef.current = pollResults; }, [pollResults]);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [apSearch, setApSearch] = useState('');
  const [nodeFilter, setNodeFilter] = useState<'active' | 'inactive' | 'all'>('active');

  // Modals
  const [cpeDetailTarget, setCpeDetailTarget] = useState<{
    mac: string; apId: string; ip: string | null;
    sshPort: number; sshUser: string; sshPass: string;
  } | null>(null);
  const [apDetailDev, setApDetailDev] = useState<SavedDevice | null>(null);
  const [m5DetailDevice, setM5DetailDevice] = useState<SavedDevice | null>(null);
  const [viewingApDevice, setViewingApDevice] = useState<SavedDevice | null>(null);
  const [movingDevice, setMovingDevice] = useState<SavedDevice | null>(null);

  const pollTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const expandedApsRef = useRef(expandedAps);
  const devicesRef = useRef(devices);
  const nodesRef = useRef(nodes);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const autoPolledRef = useRef(false);
  const prevActiveNodeNameRef = useRef<string | null>(null);

  useEffect(() => { expandedApsRef.current = expandedAps; }, [expandedAps]);
  useEffect(() => { devicesRef.current = devices; }, [devices]);
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);

  // Efecto de limpieza cuando el túnel cae: detener polls y resetear auto-poll
  useEffect(() => {
    const prevName = prevActiveNodeNameRef.current;
    prevActiveNodeNameRef.current = activeNodeName;
    if (prevName !== null && activeNodeName === null) {
      // Túnel cayó: detener todos los polls
      Object.values(pollTimers.current).forEach(clearTimeout);
      pollTimers.current = {};
      setExpandedAps(new Set());
      autoPolledRef.current = false;
    }
  }, [activeNodeName]);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  };

  // Node groups (APs + STAs grouped by node)
  const nodeGroups: NodeGroup[] = useMemo(() => {
    const apDevices = devices.filter(d => d.role !== 'sta');
    const staDevices = devices.filter(d => d.role === 'sta');
    const map = new Map<string, NodeGroup>();

    // Build groups from APs first — group by nodeName (reliable link between ap_groups and VPN nodes)
    for (const d of apDevices) {
      const groupKey = d.nodeName || d.nodeId;
      const node = nodes.find(n => n.nombre_nodo === groupKey);
      const groupName = node?.nombre_nodo || d.nodeName || d.nodeId;
      if (!map.has(groupKey)) map.set(groupKey, { nodeId: d.nodeId, nodeName: groupName, aps: [], stas: [] });
      map.get(groupKey)!.aps.push(d);
    }

    // Ensure groups exist for STAs whose nodeName may not have any APs yet
    for (const d of staDevices) {
      const groupKey = d.nodeName || d.nodeId;
      const node = nodes.find(n => n.nombre_nodo === groupKey);
      const groupName = node?.nombre_nodo || d.nodeName || d.nodeId;
      if (!map.has(groupKey)) map.set(groupKey, { nodeId: d.nodeId, nodeName: groupName, aps: [], stas: [] });
      map.get(groupKey)!.stas.push(d);
    }

    return [...map.values()];
  }, [devices, nodes]);

  // Filtered node groups by search + nodeFilter
  // "active" = APs del nodo cuyo túnel VPN está abierto (activeNodeName)
  const filteredGroups: NodeGroup[] = useMemo(() => {
    let groups = nodeGroups;

    if (nodeFilter === 'active') {
      // Si no hay túnel activo, grupos vacíos (se mostrará banner)
      groups = groups.filter(g => !!activeNodeName && g.nodeName === activeNodeName);
    } else if (nodeFilter === 'inactive') {
      groups = groups.filter(g => !activeNodeName || g.nodeName !== activeNodeName);
    }

    // Aplicar filtro de búsqueda
    if (!apSearch.trim()) return groups;
    const q = apSearch.toLowerCase();
    return groups.map(g => ({
      ...g,
      aps: g.aps.filter(d =>
        (d.cachedStats?.deviceName ?? d.name ?? '').toLowerCase().includes(q) ||
        (d.ip || '').toLowerCase().includes(q) ||
        (d.model ?? '').toLowerCase().includes(q) ||
        (d.cachedStats?.essid ?? d.essid ?? '').toLowerCase().includes(q)
      ),
      stas: g.stas.filter(d =>
        (d.name ?? '').toLowerCase().includes(q) ||
        (d.ip || '').toLowerCase().includes(q) ||
        (d.model ?? '').toLowerCase().includes(q) ||
        (d.mac ?? '').toLowerCase().includes(q)
      ),
    })).filter(g => g.aps.length > 0 || g.stas.length > 0);
  }, [nodeGroups, apSearch, nodeFilter, activeNodeName]);

  const loadDevices = useCallback(async () => {
    setLoading(true);
    try {
      const devs = await deviceDb.load();
      setDevices(devs);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadDevices(); }, [loadDevices]);

  // Recargar devices cuando se elimina un nodo (nodes.length decrece)
  const nodesLenRef = useRef(nodes.length);
  useEffect(() => {
    const prev = nodesLenRef.current;
    nodesLenRef.current = nodes.length;
    if (prev > 0 && nodes.length < prev) {
      loadDevices();
    }
  }, [nodes.length, loadDevices]);

  // ── Poll a single AP ─────────────────────────────────────────────────
  // scheduleNext=false: solo actualiza estado una vez (usado por auto-poll inicial)
  // scheduleNext=true (default): reprograma timer si el AP está expandido
  const pollApDirect = useCallback(async (apId: string, scheduleNext = true, saveCount = false) => {
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
          firmware: dev.firmware ?? '',
          saveHistory: false,
        }),
      }, 20_000);
      const data = await res.json();
      if (data.success) {
        setPollResults(prev => ({ ...prev, [apId]: { stations: data.stations || [], polledAt: data.polledAt, loading: false } }));
        if (saveCount) {
          const count = (data.stations || []).length;
          const updatedDev = { ...dev, lastCpeCount: count, lastCpeCountAt: Date.now() };
          setDevices(prev => prev.map(d => d.id === apId ? updatedDev : d));
          await deviceDb.saveSingle(updatedDev);
        }
      } else {
        setPollResults(prev => ({ ...prev, [apId]: { ...(prev[apId] ?? { stations: [] }), loading: false, error: data.message } }));
      }
    } catch (e) {
      setPollResults(prev => ({
        ...prev,
        [apId]: { ...(prev[apId] ?? { stations: [] }), loading: false, error: e instanceof Error ? e.message : 'Error SSH' },
      }));
    }

    // Solo reprogramar timer si scheduleNext=true Y el AP está expandido
    if (scheduleNext && pollIntervalRef.current > 0) {
      if (expandedApsRef.current.has(apId)) {
        pollTimers.current[apId] = window.setTimeout(() => pollApDirect(apId, true), pollIntervalRef.current);
      } else {
        delete pollTimers.current[apId];
      }
    }
    // scheduleNext=false: auto-poll inicial — no tocar pollTimers para evitar duplicados
  }, []);

  // ── AUTO-POLL on load: solo el nodo activo (túnel VPN abierto) ────────────
  // Lee devices/nodes a través de refs para evitar que el array de deps cambie de tamaño.
  // Solo pollea el grupo cuyo nodeName === activeNodeName una vez al cargar o al cambiar de nodo.
  useEffect(() => {
    const currentDevices = devicesRef.current;
    if (currentDevices.length === 0 || autoPolledRef.current) return;
    autoPolledRef.current = true;

    const apDevices = currentDevices.filter(d => d.role !== 'sta');
    const map = new Map<string, NodeGroup>();
    for (const d of apDevices) {
      const groupKey = d.nodeName || d.nodeId;
      const groupName = d.nodeName || d.nodeId;
      if (!map.has(groupKey)) map.set(groupKey, { nodeId: d.nodeId, nodeName: groupName, aps: [], stas: [] });
      map.get(groupKey)!.aps.push(d);
    }
    const allGroups = [...map.values()];
    // Buscar el grupo cuyo nodeName === activeNodeName
    const activeGroup = allGroups.find(g => !!activeNodeName && g.nodeName === activeNodeName);
    if (!activeGroup) return;
    const apsToInit = activeGroup.aps.filter(ap => {
      const hasCreds = ap.sshUser && (ap.sshPass || ap.hasSshPass);
      const pr = pollResultsRef.current[ap.id];
      const isFresh = pr?.polledAt && (Date.now() - pr.polledAt < 300_000); // 5 minutes
      return hasCreds && !isFresh;
    });
    const initTimers = apsToInit.map((dev, i) =>
      setTimeout(() => pollApDirect(dev.id, false), i * 600)
    );
    return () => initTimers.forEach(clearTimeout);
    // devices.length garantiza re-ejecución cuando carguen, sin incluir el array completo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devices.length, pollApDirect, activeNodeName]);

  // Start/stop polling loops when expandedAps or pollInterval changes
  useEffect(() => {
    pollIntervalRef.current = pollInterval;
    localStorage.setItem(LS_POLL_INTERVAL_KEY, pollInterval.toString());

    if (pollInterval > 0) {
      expandedAps.forEach(apId => {
        if (!pollTimers.current[apId]) pollApDirect(apId);
      });
    } else {
      Object.keys(pollTimers.current).forEach(apId => {
        clearTimeout(pollTimers.current[apId]); delete pollTimers.current[apId];
      });
    }
    Object.keys(pollTimers.current).forEach(apId => {
      if (!expandedAps.has(apId)) { clearTimeout(pollTimers.current[apId]); delete pollTimers.current[apId]; }
    });
  }, [expandedAps, pollApDirect, pollInterval]);

  // Cleanup on unmount
  useEffect(() => () => {
    Object.values(pollTimers.current).forEach(clearTimeout);
    clearTimeout(toastTimer.current);
  }, []);

  const toggleAp = (apId: string) => {
    setExpandedAps(prev => {
      const next = new Set(prev);
      if (next.has(apId)) next.delete(apId); else next.add(apId);
      return next;
    });
  };

  // Delete a device
  const handleDeleteDev = async (dev: SavedDevice) => {
    if (!window.confirm(`¿Eliminar ${dev.cachedStats?.deviceName ?? dev.name ?? dev.ip}?`)) return;
    setDevices(prev => prev.filter(d => d.id !== dev.id));
    if (viewingApDevice?.id === dev.id) setViewingApDevice(null);
    if (apDetailDev?.id === dev.id) setApDetailDev(null);
    await deviceDb.removeSingle(dev.id);
    showToast('Equipo eliminado');
  };

  // Update device after DeviceCard edit
  const handleUpdateApDevice = async (updated: SavedDevice) => {
    setDevices(prev => prev.map(d => d.id === updated.id ? updated : d));
    await deviceDb.saveSingle(updated);
    if (viewingApDevice?.id === updated.id) setViewingApDevice(updated);
  };

  const handleMoveConfirm = async (nodeId: string, nodeName: string) => {
    if (!movingDevice) return;
    try {
      const res = await fetchWithTimeout(`${API_BASE_URL}/api/db/devices/${movingDevice.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodeId, nodeName }),
      }, 10_000);
      const data = await res.json();
      if (data.success) {
        setDevices(prev => prev.map(d => d.id === movingDevice.id ? { ...d, nodeId, nodeName } : d));
        showToast(`Movido a ${nodeName}`);
        setMovingDevice(null);
      } else {
        showToast('Error al mover dispositivo', 'error');
      }
    } catch {
      showToast('Error al mover dispositivo', 'error');
    }
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
          {toast.type === 'error'
            ? <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            : <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
          <span>{toast.msg}</span>
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
          {/* Node filter: active / inactive / all */}
          <div className="flex items-center rounded-lg border border-slate-200 overflow-hidden text-xs shrink-0">
            <button
              onClick={() => setNodeFilter('active')}
              title="Nodos activos"
              className={`flex items-center gap-1 px-2 py-1.5 font-bold transition-colors
                ${nodeFilter === 'active'
                  ? 'bg-emerald-500 text-white'
                  : 'bg-white text-slate-500 hover:bg-slate-50'}`}>
              <CheckCircle2 className="w-3 h-3" />
              <span className="text-[10px]">Activos</span>
            </button>
            <button
              onClick={() => setNodeFilter('inactive')}
              title="Nodos inactivos"
              className={`flex items-center gap-1 px-2 py-1.5 font-bold border-x border-slate-200 transition-colors
                ${nodeFilter === 'inactive'
                  ? 'bg-amber-500 text-white'
                  : 'bg-white text-slate-500 hover:bg-slate-50'}`}>
              <ZapOff className="w-3 h-3" />
              <span className="text-[10px]">Inactivos</span>
            </button>
            <button
              onClick={() => setNodeFilter('all')}
              title="Todos los nodos"
              className={`flex items-center gap-1 px-2 py-1.5 font-bold transition-colors
                ${nodeFilter === 'all'
                  ? 'bg-indigo-500 text-white'
                  : 'bg-white text-slate-500 hover:bg-slate-50'}`}>
              <Users className="w-3 h-3" />
              <span className="text-[10px]">Todos</span>
            </button>
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
          <div className="flex items-center gap-1.5 border border-slate-200 rounded-xl px-2 bg-white">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={pollInterval}
              onChange={e => setPollInterval(Number(e.target.value))}
              className="text-xs bg-transparent focus:outline-none text-slate-600 font-medium py-2 appearance-none pr-4"
              style={{ backgroundImage: `url('data:image/svg+xml;utf8,<svg fill="none" viewBox="0 0 24 24" stroke="%2394a3b8" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>')`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right center', backgroundSize: '0.8rem' }}
            >
              <option value={0}>Auto-poll Off</option>
              <option value={15000}>15s</option>
              <option value={30000}>30s</option>
              <option value={60000}>1m</option>
              <option value={120000}>2m</option>
              <option value={300000}>5m</option>
            </select>
          </div>
          <button onClick={() => {
            Object.values(pollTimers.current).forEach(clearTimeout);
            pollTimers.current = {};
            autoPolledRef.current = false;
            loadDevices();
          }} disabled={loading}
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
        <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {pollInterval > 0 ? `Poll cada ${pollInterval/1000}s (expandido)` : 'Auto-poll desactivado'}</span>
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

      {/* Banner: sin túnel activo y filtro 'active' */}
      {!loading && nodeFilter === 'active' && !tunnelActive && filteredGroups.length === 0 && (
        <div className="card p-8 text-center text-slate-400">
          <WifiOff className="w-8 h-8 mx-auto mb-3 text-amber-400" />
          <p className="font-semibold text-slate-600">Sin túnel VPN activo</p>
          <p className="text-sm mt-1">Conéctate a un nodo para ver sus APs en tiempo real</p>
        </div>
      )}

      {/* Node groups */}
      {!loading && filteredGroups.map(group => (
        <ApGroupCard
          key={group.nodeId}
          group={group}
          expandedAps={expandedAps}
          pollResults={pollResults}
          activeNodeName={activeNodeName}
          tunnelActive={tunnelActive}
          onToggleAp={toggleAp}
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
          onM5Detail={dev => setM5DetailDevice(dev)}
          onApView={dev => setViewingApDevice(dev)}
          onApSync={apId => pollApDirect(apId, true, true)}
          onApDelete={dev => handleDeleteDev(dev)}
          onApMove={dev => setMovingDevice(dev)}
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

      {m5DetailDevice && (
        <M5FullInfoModal dev={m5DetailDevice} onClose={() => setM5DetailDevice(null)} />
      )}

      {viewingApDevice && (
        <DeviceCardModal
          device={viewingApDevice}
          onClose={() => setViewingApDevice(null)}
          onRemove={() => handleDeleteDev(viewingApDevice)}
          onUpdate={handleUpdateApDevice}
        />
      )}

      {movingDevice && (
        <MoveToNodeModal
          device={movingDevice}
          nodes={nodes}
          knownNames={[...new Set(devices.map(d => d.nodeName).filter(Boolean))]}
          onConfirm={handleMoveConfirm}
          onClose={() => setMovingDevice(null)}
        />
      )}
    </div>
  );
}
