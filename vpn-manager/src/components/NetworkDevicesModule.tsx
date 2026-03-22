import { useState, useEffect, useCallback, useRef, Fragment, useMemo } from 'react';
import type { ReactNode } from 'react';
import {
  Cpu, RefreshCw, Loader2, Radio, AlertCircle,
  ShieldCheck, ShieldOff, Check, X, Wifi, Info,
  Eye, Pencil, Trash2, CheckCircle2, ExternalLink, Router,
  ChevronUp, ChevronDown, ChevronRight, PlusCircle,
  SlidersHorizontal, Database, Search, KeyRound,
} from 'lucide-react';
import { useVpn } from '../context/VpnContext';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';
import { deviceDb } from '../store/deviceDb';
import DeviceCard from './DeviceCard';
import { API_BASE_URL } from '../config';
import type { ScannedDevice, SavedDevice, AntennaStats } from '../types/devices';
import type { NodeInfo } from '../types/api';

const SESSION_SCAN_KEY = 'vpn_scan_results_v1';
const COLS_STORAGE_KEY = 'vpn_diag_cols_v1';

// Estima el número de hosts en un CIDR (ej: 192.168.1.0/24 → 254)
const estimateIpCount = (cidr: string): number => {
  const m = cidr.match(/\/(\d+)$/);
  if (!m) return 254;
  const prefix = parseInt(m[1]);
  return Math.max(2, (1 << (32 - prefix)) - 2);
};

// ── Estado de autenticación SSH por IP ───────────────────────────────────
type SshAuthStatus = 'pending' | 'success' | 'failed';

// ── Definición de columnas configurables ─────────────────────────────────
interface ColumnDef {
  key: string;
  label: string;
  width: string;
  defaultVisible: boolean;
  requiresStats: boolean;
  render: (dev: ScannedDevice) => ReactNode;
}

const COLUMN_DEFS: ColumnDef[] = [
  {
    key: 'essid',
    label: 'SSID / AP',
    width: 'minmax(120px, 1fr)',
    defaultVisible: true,
    requiresStats: false,
    render: (dev) => {
      const ssid = dev.cachedStats?.essid ?? dev.essid;
      const parentAp = dev.parentAp;
      if (!ssid && !parentAp) return <span className="text-[10px] text-slate-300">—</span>;
      return (
        <div className="min-w-0">
          {ssid && (
            <span className="font-mono text-[11px] text-slate-600 truncate block" title={ssid}>{ssid}</span>
          )}
          {parentAp && parentAp !== ssid && (
            <span className="text-[9px] text-violet-500 truncate block" title={`AP: ${parentAp}`}>{parentAp}</span>
          )}
        </div>
      );
    },
  },
  {
    key: 'signal',
    label: 'Señal',
    width: '76px',
    defaultVisible: true,
    requiresStats: true,
    render: (dev) => {
      const v = dev.cachedStats?.signal;
      if (v == null) return <span className="text-[10px] text-slate-300">—</span>;
      const c = v >= -65 ? 'text-emerald-600' : v >= -75 ? 'text-sky-600' : 'text-amber-500';
      return <span className={`font-mono font-bold text-xs ${c}`}>{v} dBm</span>;
    },
  },
  {
    key: 'ccq',
    label: 'CCQ',
    width: '62px',
    defaultVisible: true,
    requiresStats: true,
    render: (dev) => {
      const v = dev.cachedStats?.ccq;
      if (v == null) return <span className="text-[10px] text-slate-300">—</span>;
      const c = v >= 80 ? 'text-emerald-600' : v >= 60 ? 'text-sky-600' : 'text-amber-500';
      return <span className={`font-mono font-bold text-xs ${c}`}>{v}%</span>;
    },
  },
  {
    key: 'txRate',
    label: 'TX',
    width: '66px',
    defaultVisible: true,
    requiresStats: true,
    render: (dev) => {
      const v = dev.cachedStats?.txRate;
      if (v == null) return <span className="text-[10px] text-slate-300">—</span>;
      return <span className="font-mono text-xs text-slate-600">{v} Mbps</span>;
    },
  },
  {
    key: 'rxRate',
    label: 'RX',
    width: '66px',
    defaultVisible: true,
    requiresStats: true,
    render: (dev) => {
      const v = dev.cachedStats?.rxRate;
      if (v == null) return <span className="text-[10px] text-slate-300">—</span>;
      return <span className="font-mono text-xs text-slate-600">{v} Mbps</span>;
    },
  },
  {
    key: 'noise',
    label: 'Noise',
    width: '76px',
    defaultVisible: false,
    requiresStats: true,
    render: (dev) => {
      const v = dev.cachedStats?.noiseFloor;
      if (v == null) return <span className="text-[10px] text-slate-300">—</span>;
      return <span className="font-mono text-xs text-slate-500">{v} dBm</span>;
    },
  },
  {
    key: 'cpu',
    label: 'CPU',
    width: '60px',
    defaultVisible: false,
    requiresStats: true,
    render: (dev) => {
      const v = dev.cachedStats?.cpuLoad;
      if (v == null) return <span className="text-[10px] text-slate-300">—</span>;
      const c = v < 50 ? 'text-emerald-600' : v < 80 ? 'text-amber-500' : 'text-rose-500';
      return <span className={`font-mono font-bold text-xs ${c}`}>{v}%</span>;
    },
  },
  {
    key: 'mem',
    label: 'RAM',
    width: '60px',
    defaultVisible: false,
    requiresStats: true,
    render: (dev) => {
      const v = dev.cachedStats?.memoryPercent;
      if (v == null) return <span className="text-[10px] text-slate-300">—</span>;
      const c = v < 60 ? 'text-emerald-600' : v < 80 ? 'text-amber-500' : 'text-rose-500';
      return <span className={`font-mono font-bold text-xs ${c}`}>{v}%</span>;
    },
  },
  {
    key: 'amq',
    label: 'AM Quality',
    width: '80px',
    defaultVisible: false,
    requiresStats: true,
    render: (dev) => {
      const v = dev.cachedStats?.airmaxQuality;
      if (v == null) return <span className="text-[10px] text-slate-300">—</span>;
      const c = v >= 80 ? 'text-emerald-600' : v >= 60 ? 'text-sky-600' : 'text-amber-500';
      return <span className={`font-mono font-bold text-xs ${c}`}>{v}%</span>;
    },
  },
  {
    key: 'amc',
    label: 'AM Cap.',
    width: '72px',
    defaultVisible: false,
    requiresStats: true,
    render: (dev) => {
      const v = dev.cachedStats?.airmaxCapacity;
      if (v == null) return <span className="text-[10px] text-slate-300">—</span>;
      const c = v >= 80 ? 'text-emerald-600' : v >= 60 ? 'text-sky-600' : 'text-amber-500';
      return <span className={`font-mono font-bold text-xs ${c}`}>{v}%</span>;
    },
  },
  {
    key: 'uptime',
    label: 'Uptime',
    width: '110px',
    defaultVisible: false,
    requiresStats: true,
    render: (dev) => {
      const v = dev.cachedStats?.uptimeStr;
      if (!v) return <span className="text-[10px] text-slate-300">—</span>;
      return <span className="font-mono text-[10px] text-slate-500">{v}</span>;
    },
  },
  {
    key: 'txPower',
    label: 'TX Power',
    width: '72px',
    defaultVisible: false,
    requiresStats: true,
    render: (dev) => {
      const v = dev.cachedStats?.txPower;
      if (v == null) return <span className="text-[10px] text-slate-300">—</span>;
      return <span className="font-mono text-xs text-slate-500">{v} dBm</span>;
    },
  },
  {
    key: 'chanbw',
    label: 'Canal',
    width: '66px',
    defaultVisible: false,
    requiresStats: true,
    render: (dev) => {
      const v = dev.cachedStats?.channelWidth;
      if (v == null) return <span className="text-[10px] text-slate-300">—</span>;
      return <span className="font-mono text-xs text-slate-500">{v} MHz</span>;
    },
  },
];

// ── Modal agregar / editar credenciales ──────────────────────────────────
interface AddDeviceModalProps {
  device: ScannedDevice;
  node: NodeInfo;
  existing?: Pick<SavedDevice, 'sshUser' | 'sshPass' | 'sshPort' | 'routerPort'>;
  onSave: (d: SavedDevice) => void;
  onClose: () => void;
}

function AddDeviceModal({ device, node, existing, onSave, onClose }: AddDeviceModalProps) {
  const [sshUser, setSshUser] = useState(existing?.sshUser ?? 'ubnt');
  const [sshPass, setSshPass] = useState(existing?.sshPass ?? '');
  const [sshPort, setSshPort] = useState(existing?.sshPort ?? 22);
  const [routerPort, setRouterPort] = useState(existing?.routerPort ?? 8075);

  const deviceId = device.mac ? device.mac.replace(/:/g, '') : device.ip.replace(/\./g, '');

  const handleSave = () => {
    const saved: SavedDevice = {
      id: deviceId,
      mac: device.mac,
      ip: device.ip,
      name: device.name,
      model: device.model,
      firmware: device.firmware,
      role: device.role,
      parentAp: device.parentAp,
      essid: device.essid,
      frequency: device.frequency,
      nodeId: node.id,
      nodeName: node.nombre_nodo,
      sshUser: sshUser || undefined,
      sshPass: sshPass || undefined,
      sshPort: sshPort !== 22 ? sshPort : undefined,
      routerPort: routerPort !== 8075 ? routerPort : undefined,
      addedAt: Date.now(),
    };
    onSave(saved);
  };

  const isEdit = !!existing;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm px-4 animate-in fade-in duration-200"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-5 max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-800">{isEdit ? 'Editar dispositivo' : 'Guardar dispositivo'}</h3>
            <p className="text-xs text-slate-400 mt-0.5">{device.name} · {device.model} · {device.ip}</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* SSH */}
        <div className="space-y-2">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center space-x-1">
            <Cpu className="w-3 h-3" /><span>SSH — Antena Ubiquiti</span>
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">Usuario</label>
              <input value={sshUser} onChange={e => setSshUser(e.target.value)} className="input-field w-full text-xs" placeholder="ubnt" />
            </div>
            <div>
              <label className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">Puerto SSH</label>
              <input type="number" value={sshPort} onChange={e => setSshPort(+e.target.value)} className="input-field w-full text-xs" />
            </div>
          </div>
          <div>
            <label className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">Clave SSH</label>
            <input type="password" value={sshPass} onChange={e => setSshPass(e.target.value)} className="input-field w-full text-xs" placeholder="contraseña SSH" />
          </div>
        </div>

        {/* Puerto WebUI router */}
        <div className="space-y-2">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center space-x-1">
            <Wifi className="w-3 h-3" /><span>Router del cliente</span>
          </p>
          <div>
            <label className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">
              Puerto WebUI <span className="normal-case font-normal text-slate-300">(acceso en {device.ip}:puerto)</span>
            </label>
            <input type="number" value={routerPort} onChange={e => setRouterPort(+e.target.value)} className="input-field w-full text-xs" />
          </div>
        </div>

        {/* Nodo */}
        <div className="bg-slate-50 rounded-xl p-3 flex items-center space-x-2">
          <Radio className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
          <div>
            <p className="text-xs text-slate-500">Nodo asociado</p>
            <p className="text-xs font-bold text-slate-700">
              {node.nombre_nodo}
              {node.segmento_lan && <span className="font-mono font-normal text-slate-400 ml-1">({node.segmento_lan})</span>}
            </p>
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">
            Cancelar
          </button>
          <button onClick={handleSave}
            className="flex-1 flex items-center justify-center space-x-2 py-2.5 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-all active:scale-[0.98]">
            <Check className="w-4 h-4" />
            <span>{isEdit ? 'Actualizar' : 'Guardar'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal para ver DeviceCard ────────────────────────────────────────────
interface DeviceCardModalProps {
  device: SavedDevice;
  onClose: () => void;
  onRemove?: () => void;
  onUpdate?: (updated: SavedDevice) => void;
  isPreview?: boolean;
}

function DeviceCardModal({ device, onClose, onRemove, onUpdate, isPreview }: DeviceCardModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm px-4 py-6 animate-in fade-in duration-200"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between bg-slate-800 rounded-t-2xl px-4 py-2.5">
          <span className="text-xs font-bold text-slate-300">
            {isPreview ? 'Vista previa del dispositivo' : 'Detalle del dispositivo'}
          </span>
          <button onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <DeviceCard
          device={device}
          onRemove={onRemove ? () => { onRemove(); onClose(); } : undefined}
          onUpdate={onUpdate}
          isPreview={isPreview}
        />
      </div>
    </div>
  );
}

// ── Interfaz para el Auto-Login ──────────────────────────────────────────
interface ScanCred {
  user: string;
  pass: string;
}

// ── Panel de estadísticas expandido (diagnóstico sin guardar) ────────────
function ExpandedStats({ dev }: { dev: ScannedDevice }) {
  const s = dev.cachedStats;
  const [showRaw, setShowRaw] = useState(false);

  if (!s) {
    return (
      <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 text-xs text-slate-400 italic">
        Sin estadísticas SSH disponibles para este dispositivo.
      </div>
    );
  }

  type StatItem = { label: string; value: string | null; color?: string; mono?: boolean };

  const snr = s.signal != null && s.noiseFloor != null ? s.signal - s.noiseFloor : null;

  // Formatea firmware: "XM.v5.6.15.33787.180511.1652" → "v5.6.15 (XM)"
  const fmtFirmware = (fw: string | undefined) => {
    if (!fw) return null;
    const m = fw.match(/^([A-Z]+)\.?(v[\d.]+)/);
    if (m) return `${m[2]} (${m[1]})`;
    return fw;
  };

  const items: StatItem[] = [
    {
      label: 'Señal',
      value: s.signal != null ? `${s.signal} dBm` : null,
      color: s.signal != null
        ? (s.signal >= -65 ? 'text-emerald-600' : s.signal >= -75 ? 'text-sky-600' : 'text-amber-500')
        : undefined,
      mono: true,
    },
    {
      label: 'Noise Floor',
      value: s.noiseFloor != null ? `${s.noiseFloor} dBm` : null,
      mono: true,
    },
    {
      label: 'SNR',
      value: snr != null ? `${snr} dB` : null,
      color: snr != null ? (snr >= 30 ? 'text-emerald-600' : snr >= 15 ? 'text-sky-600' : 'text-amber-500') : undefined,
      mono: true,
    },
    {
      label: 'CCQ',
      value: s.ccq != null ? `${s.ccq}%` : null,
      color: s.ccq != null ? (s.ccq >= 80 ? 'text-emerald-600' : s.ccq >= 60 ? 'text-sky-600' : 'text-amber-500') : undefined,
      mono: true,
    },
    { label: 'TX Rate', value: s.txRate != null ? `${s.txRate} Mbps` : null, mono: true },
    { label: 'RX Rate', value: s.rxRate != null ? `${s.rxRate} Mbps` : null, mono: true },
    {
      label: 'CPU',
      value: s.cpuLoad != null ? `${s.cpuLoad}%` : null,
      color: s.cpuLoad != null ? (s.cpuLoad < 50 ? 'text-emerald-600' : s.cpuLoad < 80 ? 'text-amber-500' : 'text-rose-500') : undefined,
      mono: true,
    },
    {
      label: 'RAM',
      value: s.memoryPercent != null ? `${s.memoryPercent}%` : null,
      color: s.memoryPercent != null ? (s.memoryPercent < 60 ? 'text-emerald-600' : s.memoryPercent < 80 ? 'text-amber-500' : 'text-rose-500') : undefined,
      mono: true,
    },
    {
      label: 'AM Quality',
      value: s.airmaxQuality != null ? `${s.airmaxQuality}%` : null,
      color: s.airmaxQuality != null ? (s.airmaxQuality >= 80 ? 'text-emerald-600' : s.airmaxQuality >= 60 ? 'text-sky-600' : 'text-amber-500') : undefined,
      mono: true,
    },
    {
      label: 'AM Capacity',
      value: s.airmaxCapacity != null ? `${s.airmaxCapacity}%` : null,
      color: s.airmaxCapacity != null ? (s.airmaxCapacity >= 80 ? 'text-emerald-600' : s.airmaxCapacity >= 60 ? 'text-sky-600' : 'text-amber-500') : undefined,
      mono: true,
    },
    { label: 'Uptime', value: s.uptimeStr || null, mono: true },
    { label: 'TX Power', value: s.txPower != null ? `${s.txPower} dBm` : null, mono: true },
    { label: 'Canal', value: s.channelWidth != null ? `${s.channelWidth} MHz` : null, mono: true },
    { label: 'Frecuencia', value: s.frequency != null ? `${s.frequency} MHz` : null, mono: true },
    { label: 'Modo', value: s.mode || null },
    { label: 'Modo Red', value: s.networkMode || null },
    { label: 'Seguridad', value: s.security || null },
    { label: 'Chains', value: s.chains || null, mono: true },
    { label: 'WLAN MAC', value: s.wlanMac || null, mono: true },
    { label: 'LAN MAC', value: s.lanMac || null, mono: true },
    { label: 'AP MAC', value: s.apMac || null, mono: true },
    { label: 'Firmware', value: fmtFirmware(s.firmwareVersion || dev.firmware) },
    { label: 'Modelo', value: s.deviceModel || dev.model || null },
    { label: 'Hostname', value: s.deviceName || dev.name || null },
    { label: 'Estaciones', value: s.stations?.length != null ? String(s.stations.length) : null },
  ].filter(i => i.value != null && i.value !== '') as (StatItem & { value: string })[];

  return (
    <div className="px-5 py-4 bg-gradient-to-r from-slate-50 to-indigo-50/30 border-t border-slate-200">
      {/* Header del panel */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2">
          <div className="w-1 h-4 bg-indigo-400 rounded-full" />
          <span className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-widest">
            Estadísticas completas · {dev.ip}
          </span>
          {dev.sshUser && (
            <span className="text-[10px] sm:text-xs font-mono text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-md border border-emerald-200">
              {dev.sshUser}
            </span>
          )}
        </div>
        {/* Toggle raw JSON */}
        {s._rawJson && (
          <button
            onClick={() => setShowRaw(r => !r)}
            className="flex items-center space-x-1 text-xs font-bold text-slate-500 hover:text-indigo-600 transition-colors px-2 py-1 rounded-md hover:bg-indigo-50"
          >
            <Info className="w-3 h-3" />
            <span>{showRaw ? 'Ocultar JSON' : 'Ver JSON crudo'}</span>
          </button>
        )}
      </div>

      {/* Grid de stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-1.5">
        {items.map(item => (
          <div key={item.label} className="bg-white rounded-lg px-3 py-2 border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
            <p className="text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">{item.label}</p>
            <p className={`text-sm font-bold truncate ${item.color ?? 'text-slate-800'} ${item.mono ? 'font-mono tracking-tight' : ''}`}>
              {item.value}
            </p>
          </div>
        ))}
      </div>

      {/* Estaciones del AP */}
      {s.stations && s.stations.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
            Estaciones conectadas ({s.stations.length})
          </p>
          <div className="flex flex-wrap gap-1.5">
            {s.stations.map((sta, i) => (
              <div key={i} className="bg-white border border-slate-200 rounded-lg px-3 py-2 flex items-center space-x-3 shadow-sm hover:shadow-md transition-shadow">
                <span className="font-mono text-xs font-semibold text-slate-700">{sta.mac}</span>
                {sta.signal != null && (
                  <span className={`text-xs font-bold ${sta.signal >= -65 ? 'text-emerald-600' : sta.signal >= -75 ? 'text-sky-600' : 'text-amber-500'}`}>
                    {sta.signal} dBm
                  </span>
                )}
                {sta.ccq != null && <span className="text-xs text-slate-500">CCQ {sta.ccq}%</span>}
                {sta.txRate != null && <span className="font-mono text-xs text-slate-500">TX {sta.txRate}↑</span>}
                {sta.rxRate != null && <span className="font-mono text-xs text-slate-500">RX {sta.rxRate}↓</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Raw JSON del mca-status — para diagnóstico de modelos */}
      {showRaw && s._rawJson && (
        <div className="mt-3 border border-slate-200 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-3 py-1.5 bg-slate-100 border-b border-slate-200">
            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">
              Raw · mca-status · {s.deviceModel || dev.model}
            </span>
            <button
              onClick={() => { navigator.clipboard?.writeText(s._rawJson!); }}
              className="text-[9px] font-bold text-indigo-500 hover:text-indigo-700 transition-colors"
            >
              Copiar
            </button>
          </div>
          <pre className="p-3 text-[9px] font-mono text-slate-600 bg-slate-50 overflow-x-auto max-h-64 leading-relaxed">
            {s._rawJson}
          </pre>
        </div>
      )}
    </div>
  );
}

// ── Utilidades de formato ────────────────────────────────────────────────
const fmtBytes = (b: number): string => {
  if (b < 1024) return `${b} B`;
  if (b < 1_048_576) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1_073_741_824) return `${(b / 1_048_576).toFixed(1)} MB`;
  return `${(b / 1_073_741_824).toFixed(2)} GB`;
};
const fmtPkts = (n: number): string =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` :
    n >= 1_000 ? `${(n / 1_000).toFixed(1)}K` : String(n);

// Bloque raw colapsable — reutilizable en el modal
function RawBlock({ title, content, icon }: { title: string; content: string | null | undefined; icon?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  if (!content || !content.trim()) return null;
  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-slate-100 transition-colors text-left">
        <span className="flex items-center gap-1.5 text-[9px] font-bold text-slate-500 uppercase tracking-wider">
          {icon}{title}
        </span>
        <div className="flex items-center gap-2">
          {!open && <span className="text-[9px] text-slate-400">ver</span>}
          <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>
      {open && (
        <div className="relative">
          <button onClick={() => navigator.clipboard?.writeText(content)}
            className="absolute right-2 top-2 text-[9px] font-bold text-indigo-500 hover:text-indigo-700 bg-white px-2 py-0.5 rounded border border-indigo-200 z-10">
            Copiar
          </button>
          <pre className="p-3 text-[9px] font-mono text-slate-600 bg-slate-50 overflow-x-auto max-h-72 leading-relaxed whitespace-pre-wrap break-all">
            {content}
          </pre>
        </div>
      )}
    </div>
  );
}

// ── Strips raw diagnostic fields before saving to IndexedDB ──────────────
const stripRawStats = (stats?: AntennaStats): AntennaStats | undefined => {
  if (!stats) return stats;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { _rawUname, _rawRoutes, _rawIwconfig, _rawWstalist, _rawMcaCli, _rawNetDev, _rawMeminfo, ...rest } = stats;
  return rest;
};

// ── Modal diagnóstico SSH — muestra todos los datos obtenidos via SSH ─────
interface SshDataModalProps { dev: ScannedDevice; onClose: () => void; }
function SshDataModal({ dev, onClose }: SshDataModalProps) {
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
        {/* Header */}
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
        {/* Content */}
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

          {/* Stations */}
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

          {/* ── Tráfico TX/RX por interfaz (/proc/net/dev) ── */}
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

          {/* ── Memoria detallada (/proc/meminfo) ── */}
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

          {/* ── Secciones raw colapsables ── */}
          <RawBlock title="Parámetros inalámbricos (iwconfig ath0)" content={s._rawIwconfig} />
          <RawBlock title="Estaciones conectadas (wstalist)" content={s._rawWstalist} />
          <RawBlock title="Estado del enlace (mca-cli-op info)" content={s._rawMcaCli} />
          <RawBlock title="Tabla de rutas (route -n)" content={s._rawRoutes} />
          <RawBlock title="Sistema / Kernel (uname + uptime)" content={s._rawUname} />
          <RawBlock title="Memoria raw (/proc/meminfo)" content={s._rawMeminfo} />

          {/* Raw JSON mca-status */}
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

// ── Selector de columnas — soporta orden personalizado ────────────────────
interface ColumnPickerProps {
  visibleCols: string[];         // claves en orden visible
  onChange: (cols: string[]) => void;
}

function ColumnPicker({ visibleCols, onChange }: ColumnPickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const visibleSet = new Set(visibleCols);
  const hiddenCols = COLUMN_DEFS.filter(c => !visibleSet.has(c.key));
  const remove = (key: string) => onChange(visibleCols.filter(k => k !== key));
  const addCol = (key: string) => onChange([...visibleCols, key]);
  const moveUp = (idx: number) => {
    if (idx === 0) return;
    const next = [...visibleCols];[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]; onChange(next);
  };
  const moveDown = (idx: number) => {
    if (idx === visibleCols.length - 1) return;
    const next = [...visibleCols];[next[idx + 1], next[idx]] = [next[idx], next[idx + 1]]; onChange(next);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 border border-slate-200 transition-colors"
      >
        <SlidersHorizontal className="w-3.5 h-3.5" />
        <span>Columnas</span>
        <span className="bg-indigo-100 text-indigo-600 text-[9px] font-black px-1.5 py-0.5 rounded-md min-w-[18px] text-center">
          {visibleCols.length}
        </span>
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 z-30 bg-white border border-slate-200 rounded-xl shadow-xl p-3 w-60 max-h-[70vh] overflow-y-auto">

          {/* Columnas visibles — con orden personalizable */}
          {visibleCols.length > 0 && (
            <>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Visibles · orden</p>
              <div className="space-y-0.5 mb-2">
                {visibleCols.map((key, idx) => {
                  const col = COLUMN_DEFS.find(c => c.key === key);
                  if (!col) return null;
                  return (
                    <div key={key} className="flex items-center gap-1 py-0.5 px-1 rounded-lg hover:bg-slate-50 group">
                      <div className="flex flex-col shrink-0">
                        <button onClick={() => moveUp(idx)} disabled={idx === 0}
                          className="p-0.5 text-slate-300 hover:text-indigo-600 disabled:opacity-20 transition-colors">
                          <ChevronUp className="w-3 h-3" />
                        </button>
                        <button onClick={() => moveDown(idx)} disabled={idx === visibleCols.length - 1}
                          className="p-0.5 text-slate-300 hover:text-indigo-600 disabled:opacity-20 transition-colors">
                          <ChevronDown className="w-3 h-3" />
                        </button>
                      </div>
                      <span className="text-xs text-slate-700 flex-1 leading-tight">{col.label}</span>
                      {col.requiresStats && <span className="text-[8px] font-bold text-slate-300 uppercase">SSH</span>}
                      <button onClick={() => remove(key)}
                        className="p-0.5 text-slate-200 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100 shrink-0">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Columnas ocultas */}
          {hiddenCols.length > 0 && (
            <>
              <div className="border-t border-slate-100 my-1" />
              <p className="text-[9px] font-bold text-slate-300 uppercase tracking-wider mb-1.5 mt-2">Ocultas</p>
              <div className="space-y-0.5">
                {hiddenCols.map(col => (
                  <button key={col.key} onClick={() => addCol(col.key)}
                    className="w-full flex items-center gap-2 py-1 px-1.5 rounded-lg hover:bg-indigo-50 text-left group">
                    <span className="text-xs text-slate-400 flex-1 group-hover:text-indigo-600 transition-colors">{col.label}</span>
                    {col.requiresStats && <span className="text-[8px] font-bold text-slate-300 uppercase">SSH</span>}
                    <PlusCircle className="w-3 h-3 text-slate-200 group-hover:text-indigo-500 transition-colors shrink-0" />
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Acciones rápidas */}
          <div className="mt-2 pt-2 border-t border-slate-100 flex gap-1.5">
            <button onClick={() => onChange(COLUMN_DEFS.map(c => c.key))}
              className="flex-1 text-[10px] font-bold text-indigo-600 hover:text-indigo-700 transition-colors">
              Todas
            </button>
            <span className="text-slate-200">|</span>
            <button onClick={() => onChange(COLUMN_DEFS.filter(c => c.defaultVisible).map(c => c.key))}
              className="flex-1 text-[10px] font-bold text-slate-400 hover:text-slate-600 transition-colors">
              Resetear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Módulo principal ─────────────────────────────────────────────────────
export default function NetworkDevicesModule() {
  const { credentials, activeNodeVrf, nodes, setNodes } = useVpn();

  const [savedDevices, setSavedDevices] = useState<SavedDevice[]>([]);
  const [scanResults, setScanResults] = useState<ScannedDevice[]>([]);
  const [allScannedIPs, setAllScannedIPs] = useState<string[]>([]);
  const [scannedCount, setScannedCount] = useState(0);
  const [debugMsg, setDebugMsg] = useState('');
  const [scanError, setScanError] = useState('');
  const [selectedNode, setSelectedNode] = useState<NodeInfo | null>(null);
  const [manualLan, setManualLan] = useState('');
  const [addingDevice, setAddingDevice] = useState<ScannedDevice | null>(null);
  const [editingDevice, setEditingDevice] = useState<SavedDevice | null>(null);
  const [viewingDevice, setViewingDevice] = useState<SavedDevice | null>(null);
  const [viewingRawDevice, setViewingRawDevice] = useState<ScannedDevice | null>(null);

  // Estado de fases del escaneo
  const [scanState, setScanState] = useState<{
    phase: 'idle' | 'discovering' | 'authenticating' | 'done';
    current: number;
    total: number;
  }>({ phase: 'idle', current: 0, total: 0 });

  // Estado de autenticación SSH por IP — se llena durante la Fase 2
  const [sshStatus, setSshStatus] = useState<Record<string, SshAuthStatus>>({});

  // Filas expandidas en la tabla de diagnóstico
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // Columnas visibles en orden — persisten en localStorage como string[]
  const [visibleCols, setVisibleCols] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(COLS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as string[];
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch { /* silent */ }
    return COLUMN_DEFS.filter(c => c.defaultVisible).map(c => c.key);
  });

  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState('');
  const [discoveryProgress, setDiscoveryProgress] = useState(0);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const [sortConfig, setSortConfig] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSSID, setFilterSSID] = useState('');

  const [nodeSshCreds, setNodeSshCreds] = useState<ScanCred[]>([]);

  const saveVisibleCols = (cols: string[]) => {
    setVisibleCols(cols);
    try { localStorage.setItem(COLS_STORAGE_KEY, JSON.stringify(cols)); } catch { /* silent */ }
  };

  const showToast = (msg: string) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 4000);
  };

  const toggleSort = (key: string) => {
    setSortConfig(prev =>
      prev?.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'asc' }
    );
  };

  // Carga inicial: DB → savedIds → sessionStorage (mismo batch React 18)
  useEffect(() => {
    deviceDb.load().then(devices => {
      setSavedDevices(devices);
      setSavedIds(new Set(devices.map(d => d.id)));
      try {
        const cached = sessionStorage.getItem(SESSION_SCAN_KEY);
        if (cached) {
          const { results, allIPs, count, debug, sshStatus: cachedStatus } = JSON.parse(cached);
          if (Array.isArray(results) && results.length > 0) {
            setScanResults(results);
            setAllScannedIPs(allIPs ?? []);
            setScannedCount(count ?? 0);
            setDebugMsg(debug ?? '');
            // Restaurar estado SSH: usar el guardado o derivarlo de cachedStats
            if (cachedStatus && typeof cachedStatus === 'object') {
              setSshStatus(cachedStatus as Record<string, SshAuthStatus>);
            } else {
              const derived: Record<string, SshAuthStatus> = {};
              (results as Array<{ ip: string; cachedStats?: unknown }>).forEach(dev => {
                derived[dev.ip] = dev.cachedStats ? 'success' : 'failed';
              });
              setSshStatus(derived);
            }
          }
        }
      } catch { /* silent */ }
    });
  }, []);

  const loadNodes = useCallback(async () => {
    if (!credentials) return;
    try {
      const res = await fetchWithTimeout(`${API_BASE_URL}/api/nodes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip: credentials.ip, user: credentials.user, pass: credentials.pass }),
      }, 20_000);
      const data = await res.json();
      if (!res.ok) throw new Error((data as { message?: string }).message ?? `HTTP ${res.status}`);
      setNodes(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error cargando nodos:', err);
    }
  }, [credentials, setNodes]);

  useEffect(() => {
    if (nodes.length === 0 && credentials) loadNodes();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (activeNodeVrf && nodes.length > 0) {
      const active = nodes.find(n => n.nombre_vrf === activeNodeVrf);
      if (active) {
        setSelectedNode(active);
        const subnets = (active.lan_subnets && active.lan_subnets.length > 0) ? active.lan_subnets : (active.segmento_lan ? [active.segmento_lan] : []);
        if (subnets.length > 0) setManualLan(subnets[0]);
      }
    }
  }, [activeNodeVrf, nodes]);

  const activeNode = activeNodeVrf ? nodes.find(n => n.nombre_vrf === activeNodeVrf) ?? null : null;
  const availableSubnets: string[] = activeNode
    ? ((activeNode.lan_subnets && activeNode.lan_subnets.length > 0) ? activeNode.lan_subnets : (activeNode.segmento_lan ? [activeNode.segmento_lan] : []))
    : [];

  const effectiveLan = manualLan.trim() || selectedNode?.segmento_lan || '';

  // Timer de progreso simulado para la fase 1 (descubrimiento) — la petición es síncrona
  // así que animamos un contador 0→total a la velocidad estimada (~14s para /24)
  useEffect(() => {
    if (scanState.phase !== 'discovering') {
      setDiscoveryProgress(0);
      return;
    }
    const total = estimateIpCount(effectiveLan);
    setDiscoveryProgress(0);
    const msPerIp = Math.max(20, Math.round(13000 / total));
    const timer = setInterval(() => {
      setDiscoveryProgress(p => {
        if (p >= total) { clearInterval(timer); return total; }
        return p + 1;
      });
    }, msPerIp);
    return () => clearInterval(timer);
  }, [scanState.phase, effectiveLan]);

  // Persistir scan en sessionStorage cuando termina
  useEffect(() => {
    if (scanState.phase === 'done' && scanResults.length > 0) {
      sessionStorage.setItem(SESSION_SCAN_KEY, JSON.stringify({
        results: scanResults, allIPs: allScannedIPs, count: scannedCount, debug: debugMsg,
        sshStatus,
      }));
      const t = setTimeout(() => setScanState({ phase: 'idle', current: 0, total: 0 }), 3000);
      return () => clearTimeout(t);
    }
  }, [scanState.phase, scanResults, allScannedIPs, scannedCount, debugMsg]);

  // ── Fase 2 reutilizable: autenticación SSH vía /device/antenna (igual que "Guardar") ──
  // Usa el mismo endpoint que funciona al guardar manualmente, sin persistir en DB.
  // Prueba las claves del nodo activo en orden: primero las del dispositivo guardado (si existe),
  // luego las del nodo activo.
  const runAuthPhase = async (devices: ScannedDevice[], baseCreds: ScanCred[]) => {
    if (devices.length === 0) return;

    // Marcar todos como pendientes
    const initialStatus: Record<string, SshAuthStatus> = {};
    devices.forEach(d => { initialStatus[d.ip] = 'pending'; });
    setSshStatus(initialStatus);
    setScanState({ phase: 'authenticating', current: 0, total: devices.length });
    let completed = 0;
    const batchSize = 3; // 3 dispositivos en paralelo

    for (let i = 0; i < devices.length; i += batchSize) {
      const batch = devices.slice(i, i + batchSize);

      await Promise.all(batch.map(async (dev) => {
        try {
          // Construir lista de credenciales efectivas
          const devId = dev.mac ? dev.mac.replace(/:/g, '') : dev.ip.replace(/\./g, '');
          const savedDev = savedDevices.find(s => s.id === devId);

          let effectiveCreds = baseCreds;
          if (savedDev?.sshUser && savedDev?.sshPass) {
            const knownCred = { user: savedDev.sshUser, pass: savedDev.sshPass };
            const others = baseCreds.filter(
              c => !(c.user === knownCred.user && c.pass === knownCred.pass)
            );
            effectiveCreds = [knownCred, ...others];
          }

          if (effectiveCreds.length === 0) {
            // Sin credenciales → no marcar como error, simplemente continuar sin SSH
            completed++;
            setScanState(s => ({ ...s, current: completed }));
            return;
          }

          // Probar cada clave con /device/antenna — exactamente igual que al guardar
          let foundUser = '';
          let foundPass = '';
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let foundStats: any = null;

          for (const cred of effectiveCreds) {
            try {
              const res = await fetchWithTimeout(`${API_BASE_URL}/api/device/antenna`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  deviceIP: dev.ip,
                  deviceUser: cred.user,
                  devicePass: cred.pass,
                  devicePort: 22,
                }),
              }, 20_000);
              const d = await res.json();
              // Verificar que stats tiene datos reales (no solo el fallback { raw: "..." })
              if (d.success && d.stats && (d.stats.signal != null || d.stats.txRate != null || d.stats.deviceName != null || d.stats.firmwareVersion != null)) {
                foundUser = cred.user;
                foundPass = cred.pass;
                foundStats = d.stats;
                break; // Clave correcta encontrada → detener el loop
              } else if (d.success && d.stats?.raw) {
                // SSH funcionó pero mca-status no devolvió datos parseables — marcar igual como éxito parcial
                foundUser = cred.user;
                foundPass = cred.pass;
                foundStats = d.stats;
                break;
              }
            } catch {
              // Esa clave no funcionó → probar la siguiente
            }
          }

          if (foundStats) {
            const s = foundStats;
            setSshStatus(prev => ({ ...prev, [dev.ip]: 'success' }));
            setScanResults(prev => {
              const next = [...prev];
              const idx = next.findIndex(d => d.ip === dev.ip);
              if (idx !== -1) {
                next[idx] = {
                  ...next[idx],
                  sshUser: foundUser,
                  sshPass: foundPass,
                  sshPort: 22,
                  cachedStats: s,
                  name: s.deviceName || next[idx].name,
                  model: s.deviceModel || next[idx].model,
                  firmware: s.firmwareVersion || next[idx].firmware,
                  mac: s.wlanMac || next[idx].mac,
                  essid: s.essid || next[idx].essid,
                  frequency: s.frequency || next[idx].frequency,
                  role: s.mode || next[idx].role,
                };
              }
              return next;
            });
          } else {
            setSshStatus(prev => ({ ...prev, [dev.ip]: 'failed' }));
          }
        } catch {
          setSshStatus(prev => ({ ...prev, [dev.ip]: 'failed' }));
        } finally {
          completed++;
          setScanState(s => ({ ...s, current: completed }));
        }
      }));
    }

    setScanState(s => ({ ...s, phase: 'done' }));
  };

  // ── Fase 1 + Fase 2: escanear red y luego autenticar ────────────────────
  const handleScan = async () => {
    if (!effectiveLan) return;

    setScanState({ phase: 'discovering', current: 0, total: 0 });
    setSshStatus({});
    setExpandedRows(new Set());
    setScanError('');
    setScanResults([]);
    setAllScannedIPs([]);
    setScannedCount(0);
    setDebugMsg('');
    sessionStorage.removeItem(SESSION_SCAN_KEY);

    try {
      const res = await fetchWithTimeout(`${API_BASE_URL}/api/node/scan-devices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodeLan: effectiveLan }),
      }, 90_000);
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message ?? 'Error en el escaneo');

      const discoveredDevices: ScannedDevice[] = data.devices ?? [];
      setScanResults(discoveredDevices);
      setAllScannedIPs(data.allIPs ?? []);
      setScannedCount(data.scanned ?? 0);
      setDebugMsg(data.debug ?? '');

      // Cargar credenciales SSH del nodo activo
      let creds: ScanCred[] = nodeSshCreds;
      const activeNode2 = activeNodeVrf ? nodes.find(n => n.nombre_vrf === activeNodeVrf) : null;
      if (activeNode2?.ppp_user) {
        try {
          const cr = await fetchWithTimeout(`${API_BASE_URL}/api/node/ssh-creds/get`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pppUser: activeNode2.ppp_user }),
          }, 5_000);
          const cd = await cr.json();
          if (cd.success && Array.isArray(cd.creds) && cd.creds.length > 0) {
            creds = cd.creds.filter((c: ScanCred) => c.user);
            setNodeSshCreds(creds);
          }
        } catch { /* sin creds, continuar sin SSH */ }
      }

      await runAuthPhase(discoveredDevices, creds);
    } catch (err: unknown) {
      setScanError(err instanceof Error ? err.message : 'Error desconocido');
      setScanState({ phase: 'idle', current: 0, total: 0 });
    }
  };

  const handleAddDevice = async (device: SavedDevice) => {
    const existingIdx = savedDevices.findIndex(d => d.id === device.id);
    const existingDev = existingIdx >= 0 ? savedDevices[existingIdx] : null;
    const merged: SavedDevice = existingDev
      ? { ...existingDev, ...device, addedAt: existingDev.addedAt }
      : device;

    const current = existingIdx >= 0
      ? savedDevices.map((d, i) => i === existingIdx ? merged : d)
      : [...savedDevices, merged];

    setSavedDevices(current);
    setSavedIds(new Set(current.map(d => d.id)));
    await deviceDb.saveSingle(merged);
    setAddingDevice(null);
    setEditingDevice(null);

    // Auto-SSH en segundo plano SOLO si no viene pre-autenticado del escáner
    if (merged.sshUser && merged.sshPass && !merged.cachedStats) {
      showToast('Guardado. Conectando SSH para obtener datos…');
      try {
        const res = await fetchWithTimeout(`${API_BASE_URL}/api/device/antenna`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            deviceIP: merged.ip, deviceUser: merged.sshUser,
            devicePass: merged.sshPass, devicePort: merged.sshPort ?? 22,
          }),
        }, 20_000);
        const d = await res.json();
        if (d.success && d.stats) {
          const s = d.stats;
          const enriched: SavedDevice = {
            ...merged, lastSeen: Date.now(),
            name: s.deviceName || merged.name, model: s.deviceModel || merged.model,
            firmware: s.firmwareVersion || merged.firmware, mac: s.wlanMac || merged.mac,
            essid: s.essid ?? merged.essid, frequency: s.frequency ?? merged.frequency,
            deviceName: s.deviceName ?? merged.deviceName, lanMac: s.lanMac ?? merged.lanMac,
            security: s.security ?? merged.security, channelWidth: s.channelWidth ?? merged.channelWidth,
            networkMode: s.networkMode ?? merged.networkMode, chains: s.chains ?? merged.chains,
            apMac: s.apMac ?? merged.apMac, cachedStats: stripRawStats(s),
          };
          setSavedDevices(prev => prev.map(d => d.id === enriched.id ? enriched : d));
          await deviceDb.saveSingle(enriched);

          // Reflejar stats en la fila del escáner: actualiza cachedStats y marca como exitoso
          setScanResults(prev => {
            const next = [...prev];
            const idx = next.findIndex(r => r.ip === merged.ip);
            if (idx !== -1) {
              next[idx] = {
                ...next[idx],
                sshUser: merged.sshUser,
                sshPass: merged.sshPass,
                sshPort: merged.sshPort,
                cachedStats: s,
                name: s.deviceName || next[idx].name,
                model: s.deviceModel || next[idx].model,
                firmware: s.firmwareVersion || next[idx].firmware,
                mac: s.wlanMac || next[idx].mac,
                essid: s.essid ?? next[idx].essid,
                frequency: s.frequency ?? next[idx].frequency,
                role: s.mode || next[idx].role,
              };
            }
            return next;
          });
          setSshStatus(prev => ({ ...prev, [merged.ip]: 'success' }));

          showToast('Dispositivo guardado con datos completos');
        } else {
          showToast('Guardado. SSH sin respuesta aún');
        }
      } catch {
        showToast('Guardado. No se pudo conectar por SSH');
      }
    } else {
      showToast(existingDev
        ? 'Dispositivo actualizado'
        : merged.cachedStats ? 'Dispositivo guardado (con estadísticas)' : 'Dispositivo guardado');
    }
  };

  const handleRemoveDevice = async (id: string) => {
    setSavedDevices(prev => prev.filter(d => d.id !== id));
    setSavedIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    await deviceDb.removeSingle(id);
    if (viewingDevice?.id === id) setViewingDevice(null);
  };

  const handleUpdateDevice = async (updated: SavedDevice) => {
    setSavedDevices(prev => prev.map(d => d.id === updated.id ? updated : d));
    await deviceDb.saveSingle(updated);
    if (viewingDevice?.id === updated.id) setViewingDevice(updated);
  };

  // ── Cómputos derivados ───────────────────────────────────────────────
  const isTunnelActive = !!activeNodeVrf;
  const activeNodeName = activeNodeVrf
    ? nodes.find(n => n.nombre_vrf === activeNodeVrf)?.nombre_nodo ?? activeNodeVrf
    : null;
  const canScan = (scanState.phase === 'idle' || scanState.phase === 'done') && !!effectiveLan;
  const isScanning = scanState.phase === 'discovering' || scanState.phase === 'authenticating';

  // Todos los dispositivos escaneados, marcando cuáles están guardados
  const scanRows = scanResults.map(dev => {
    const id = dev.mac ? dev.mac.replace(/:/g, '') : dev.ip.replace(/\./g, '');
    return { dev, isSaved: savedIds.has(id), devId: id };
  });

  const uniqueSSIDs = useMemo(() =>
    [...new Set(scanRows.map(({ dev }) => dev.cachedStats?.essid ?? dev.essid).filter(Boolean) as string[])],
    [scanRows]
  );

  const filteredRows = useMemo(() => {
    return scanRows.filter(({ dev }) => {
      const ssid = (dev.cachedStats?.essid ?? dev.essid ?? '').toLowerCase();
      const name = (dev.cachedStats?.deviceName ?? dev.name ?? '').toLowerCase();
      const ip = (dev.ip || '').toLowerCase();
      const mac = (dev.cachedStats?.wlanMac ?? dev.mac ?? '').toLowerCase();
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = !q || ip.includes(q) || name.includes(q) || ssid.includes(q) || mac.includes(q);
      const matchesSSID = !filterSSID || ssid === filterSSID.toLowerCase();
      return matchesSearch && matchesSSID;
    });
  }, [scanRows, searchQuery, filterSSID]);

  const sortedRows = useMemo(() => {
    if (!sortConfig) return filteredRows;
    return [...filteredRows].sort((a, b) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let va: any, vb: any;
      switch (sortConfig.key) {
        case 'ip': va = a.dev.ip; vb = b.dev.ip; break;
        case 'name': va = a.dev.cachedStats?.deviceName ?? a.dev.name;
          vb = b.dev.cachedStats?.deviceName ?? b.dev.name; break;
        case 'essid': va = a.dev.cachedStats?.essid ?? a.dev.essid ?? '';
          vb = b.dev.cachedStats?.essid ?? b.dev.essid ?? ''; break;
        case 'signal': va = a.dev.cachedStats?.signal ?? -999;
          vb = b.dev.cachedStats?.signal ?? -999; break;
        case 'ccq': va = a.dev.cachedStats?.ccq ?? -1;
          vb = b.dev.cachedStats?.ccq ?? -1; break;
        case 'txPower': va = a.dev.cachedStats?.txPower ?? 0;
          vb = b.dev.cachedStats?.txPower ?? 0; break;
        case 'uptime': va = a.dev.cachedStats?.uptimeStr ?? '';
          vb = b.dev.cachedStats?.uptimeStr ?? ''; break;
        default: return 0;
      }
      if (va < vb) return sortConfig.dir === 'asc' ? -1 : 1;
      if (va > vb) return sortConfig.dir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredRows, sortConfig]);

  const devicesByNode = savedDevices.reduce<Record<string, { nodeName: string; devices: SavedDevice[] }>>((acc, d) => {
    if (!acc[d.nodeId]) acc[d.nodeId] = { nodeName: nodes.find(n => n.id === d.nodeId)?.nombre_nodo || d.nodeName, devices: [] };
    acc[d.nodeId].devices.push(d);
    return acc;
  }, {});

  // Grid template dinámico — columnas en orden elegido por el usuario
  const activeConfigCols = visibleCols
    .map(k => COLUMN_DEFS.find(c => c.key === k))
    .filter(Boolean) as ColumnDef[];

  // Ancho mínimo de la tabla: suma de todas las columnas fijas + configurables
  const minTableWidth = [40, 54, 148, 120, ...activeConfigCols.map(c => parseInt(c.width) || 80), 32, 180].reduce((a, b) => a + b, 0);

  const gridTemplate = [
    '40px',   // SSH status
    '54px',   // Rol / freq
    '140px',  // IP / MAC
    'minmax(100px,1fr)', // Nombre / Modelo
    ...activeConfigCols.map(c => c.width),
    '32px',   // Expand toggle
    '160px',  // Acciones
  ].join(' ');

  // ── Guardar directamente (sin modal) cuando SSH ya validó credenciales ──
  const handleDirectSave = async (dev: ScannedDevice, node: NodeInfo) => {
    const deviceId = dev.mac ? dev.mac.replace(/:/g, '') : dev.ip.replace(/\./g, '');
    const s = dev.cachedStats;
    const rawMode = s?.mode || dev.role;
    const roleNorm: 'ap' | 'sta' | 'unknown' =
      rawMode === 'ap' || rawMode === 'master' ? 'ap' : rawMode === 'sta' ? 'sta' : 'unknown';
    const saved: SavedDevice = {
      id: deviceId,
      mac: s?.wlanMac || dev.mac,
      ip: dev.ip,
      name: s?.deviceName || dev.name,
      model: s?.deviceModel || dev.model,
      firmware: s?.firmwareVersion || dev.firmware,
      role: roleNorm,
      parentAp: dev.parentAp,
      essid: s?.essid ?? dev.essid,
      frequency: s?.frequency ?? dev.frequency,
      nodeId: node.id,
      nodeName: node.nombre_nodo,
      sshUser: dev.sshUser,
      sshPass: dev.sshPass,
      sshPort: dev.sshPort !== 22 ? dev.sshPort : undefined,
      deviceName: s?.deviceName,
      lanMac: s?.lanMac,
      security: s?.security,
      channelWidth: s?.channelWidth,
      networkMode: s?.networkMode,
      chains: s?.chains,
      apMac: s?.apMac,
      cachedStats: stripRawStats(s),
      addedAt: Date.now(),
      lastSeen: Date.now(),
    };
    await handleAddDevice(saved);
  };

  // ── JSX ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center space-x-2
          bg-slate-800 text-white text-sm font-semibold px-5 py-3 rounded-2xl shadow-xl pointer-events-none">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toast}</span>
        </div>
      )}

      {/* Header */}
      <div className="card p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center space-x-2">
            <Cpu className="w-5 h-5 text-indigo-500" />
            <span>Dispositivos de Red</span>
          </h2>
          <p className="text-slate-400 text-sm mt-1">Descubre y gestiona equipos Ubiquiti en las LANs remotas</p>
        </div>
        <div className="text-sm text-slate-500">
          <span className="font-bold text-indigo-600">{savedDevices.length}</span> guardados
        </div>
      </div>

      {/* Tunnel status */}
      {isTunnelActive ? (
        <div className="card p-4 border-emerald-200 bg-gradient-to-r from-emerald-50 to-sky-50 flex items-center space-x-3">
          <div className="w-9 h-9 bg-emerald-500 rounded-xl flex items-center justify-center shadow-md shadow-emerald-500/30 shrink-0">
            <ShieldCheck className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-800">Túnel activo: <span className="text-emerald-600">{activeNodeName}</span></p>
            <p className="text-xs text-slate-400 mt-0.5">El escaneo se realiza desde este equipo hacia la LAN remota</p>
          </div>
        </div>
      ) : (
        <div className="card p-4 border-amber-200 bg-amber-50 flex items-center space-x-3">
          <ShieldOff className="w-5 h-5 text-amber-500 shrink-0" />
          <div>
            <p className="text-sm font-bold text-amber-700">Sin túnel activo</p>
            <p className="text-xs text-amber-600 mt-0.5">Activa el acceso a un nodo en la pestaña "Nodos" para poder escanear en tiempo real</p>
          </div>
        </div>
      )}

      {/* Scanner section */}
      <div className="card p-5 space-y-4">
        <h3 className="text-sm font-bold text-slate-700 flex items-center space-x-2">
          <RefreshCw className="w-4 h-4 text-indigo-500" />
          <span>Escanear LAN del nodo</span>
        </h3>

        {isTunnelActive && activeNode ? (
          <div className="space-y-3">
            {/* Nodo activo — solo lectura */}
            <div className="flex items-center gap-3 px-4 py-3 bg-emerald-50 border border-emerald-100 rounded-xl">
              <Radio className="w-4 h-4 text-emerald-500 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-800 truncate">{activeNode.nombre_nodo}</p>
                <p className="text-[10px] font-mono text-slate-400 truncate">{activeNode.nombre_vrf}</p>
              </div>
            </div>

            {/* Selector de subred */}
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                Subred LAN a escanear
                {availableSubnets.length > 1 && (
                  <span className="ml-1.5 normal-case font-normal text-slate-300">({availableSubnets.length} disponibles)</span>
                )}
              </label>
              {availableSubnets.length > 1 ? (
                <select
                  value={manualLan}
                  onChange={e => setManualLan(e.target.value)}
                  className="input-field w-full text-sm font-mono"
                >
                  {availableSubnets.map(s => (
                    <option key={s} value={s}>{s} ({estimateIpCount(s)} hosts)</option>
                  ))}
                </select>
              ) : availableSubnets.length === 1 ? (
                <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl">
                  <span className="font-mono text-sm font-bold text-sky-600">{availableSubnets[0]}</span>
                  <span className="text-[10px] text-slate-400 ml-1">· {estimateIpCount(availableSubnets[0])} hosts</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 border border-amber-100 rounded-xl">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <span className="text-xs text-amber-600">No hay subredes configuradas en este nodo</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Sin túnel activo: input manual */
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
              Subred LAN (CIDR) — manual
            </label>
            <input
              value={manualLan}
              onChange={e => setManualLan(e.target.value)}
              placeholder="ej: 10.5.5.0/24"
              className="input-field w-full text-sm font-mono"
            />
            <p className="text-[10px] text-slate-400 mt-1">Activa un túnel en la pestaña Nodos para autocompletar la subred.</p>
          </div>
        )}

        {/* Info de credenciales SSH del nodo activo */}
        {isTunnelActive && activeNode && (
          <div className="border-t border-slate-100 pt-3 mt-1 flex items-center gap-2">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs border ${nodeSshCreds.length > 0 ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
              <KeyRound className="w-3.5 h-3.5 shrink-0" />
              {nodeSshCreds.length > 0
                ? <span>SSH: <strong>{nodeSshCreds.map(c => c.user).join(', ')}</strong> · {nodeSshCreds.length} credencial{nodeSshCreds.length > 1 ? 'es' : ''}</span>
                : <span>Sin credenciales SSH — configúralas en el nodo (ícono <KeyRound className="w-3 h-3 inline" />)</span>
              }
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {/* Botón principal: escanear red completa */}
          <button onClick={handleScan} disabled={!canScan}
            className={`flex items-center space-x-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all
              ${canScan
                ? 'bg-gradient-to-r from-indigo-500 to-indigo-600 text-white shadow-md shadow-indigo-500/25 hover:shadow-lg active:scale-[0.98]'
                : 'bg-slate-100 text-slate-300 cursor-not-allowed'}`}
          >
            {isScanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            <span>{isScanning ? `Escaneando ${effectiveLan}...` : 'Escanear dispositivos'}</span>
          </button>

        </div>

        {/* Progress Bar */}
        {scanState.phase !== 'idle' && (
          <div className="mt-4 p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3 animate-in fade-in slide-in-from-top-2">
            <div className="flex justify-between items-center text-[11px] font-bold text-slate-600 uppercase tracking-widest">
              <span className="flex items-center space-x-2">
                {scanState.phase === 'done' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                ) : (
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
                )}
                <span>
                  {scanState.phase === 'discovering' ? 'Buscando dispositivos en la red...' :
                    scanState.phase === 'authenticating' ? 'Probando accesos SSH y extrayendo datos...' :
                      'Escaneo finalizado exitosamente'}
                </span>
              </span>
              {scanState.phase === 'discovering' && (
                <span className="text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded-md font-mono">
                  {discoveryProgress} / {estimateIpCount(effectiveLan)} IPs
                </span>
              )}
              {scanState.phase === 'authenticating' && (
                <span className="text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded-md font-mono">
                  {scanState.current} / {scanState.total} dispositivos
                </span>
              )}
            </div>

            <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden relative">
              {scanState.phase === 'discovering' && (
                <div
                  className="h-full transition-all duration-150 ease-out bg-indigo-500"
                  style={{ width: `${(discoveryProgress / Math.max(1, estimateIpCount(effectiveLan))) * 100}%` }}
                />
              )}
              {scanState.phase === 'authenticating' && (
                <div
                  className="h-full transition-all duration-300 ease-out shadow-sm bg-indigo-500"
                  style={{ width: `${(scanState.current / Math.max(1, scanState.total)) * 100}%` }}
                />
              )}
              {scanState.phase === 'done' && (
                <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: '100%' }} />
              )}
            </div>
          </div>
        )}

        {debugMsg && !scanError && (
          <div className="flex items-start space-x-2 text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-400" />
            <span>{debugMsg}</span>
          </div>
        )}
        {scanError && (
          <div className="flex items-start space-x-2 p-3 bg-rose-50 border border-rose-200 rounded-xl">
            <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
            <p className="text-xs text-rose-600">{scanError}</p>
          </div>
        )}
        {!isScanning && scannedCount > 0 && scanResults.length === 0 && !scanError && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-1.5">
            <p className="text-xs font-semibold text-amber-700">
              Se escanearon {scannedCount} IPs en {effectiveLan} pero ninguna respondió como Ubiquiti airOS
            </p>
            <p className="text-[10px] text-amber-500">
              Verifica que el túnel VRF esté activo en la pestaña "Nodos" y que los equipos tengan HTTP habilitado en puerto 80
            </p>
          </div>
        )}

        {/* ── TABLA DE DIAGNÓSTICO (todos los dispositivos escaneados) ── */}
        {scanRows.length > 0 && (
          <div>
            {/* Cabecera con stats y selector de columnas */}
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <span>
                  {scanRows.length} dispositivo{scanRows.length !== 1 ? 's' : ''}
                </span>
                {scanRows.filter(r => r.dev.cachedStats).length > 0 && (
                  <>
                    <span className="text-slate-200">·</span>
                    <span className="text-emerald-500">
                      {scanRows.filter(r => r.dev.cachedStats).length} autenticados
                    </span>
                  </>
                )}
                {scanRows.filter(r => r.isSaved).length > 0 && (
                  <>
                    <span className="text-slate-200">·</span>
                    <span className="text-indigo-500">
                      {scanRows.filter(r => r.isSaved).length} guardados
                    </span>
                  </>
                )}
              </p>
              <ColumnPicker visibleCols={visibleCols} onChange={saveVisibleCols} />
            </div>

            {/* Barra de búsqueda + filtro SSID */}
            <div className="flex flex-wrap gap-2 px-1 py-2 items-center">
              <div className="relative flex-1 min-w-[180px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar IP, nombre, MAC..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500 text-xs">✕</button>
                )}
              </div>
              {uniqueSSIDs.length > 0 && (
                <select
                  value={filterSSID}
                  onChange={e => setFilterSSID(e.target.value)}
                  className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 text-slate-600"
                >
                  <option value="">Todos los AP</option>
                  {uniqueSSIDs.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              )}
              {(searchQuery || filterSSID) && (
                <span className="text-xs text-slate-400">
                  {sortedRows.length} de {scanRows.length} dispositivos
                </span>
              )}
            </div>

            {/* Tabla con columnas dinámicas — scroll horizontal cuando hay muchas columnas */}
            <div className="rounded-xl border border-slate-200 overflow-x-auto">
              <div style={{ minWidth: `${minTableWidth}px` }}>

                {/* Fila de cabecera */}
                <div
                  className="bg-slate-100 border-b border-slate-200 text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider rounded-tl-xl rounded-tr-xl"
                  style={{ display: 'grid', gridTemplateColumns: gridTemplate }}
                >
                  <div className="px-3 py-3 text-center">SSH</div>
                  <div className="px-3 py-3">Rol</div>
                  <div
                    className="px-3 py-3 cursor-pointer select-none flex items-center gap-1 hover:text-slate-700"
                    onClick={() => toggleSort('ip')}
                  >
                    IP / MAC
                    {sortConfig?.key === 'ip' && <span className="text-indigo-600">{sortConfig.dir === 'asc' ? '↑' : '↓'}</span>}
                  </div>
                  <div
                    className="px-3 py-3 cursor-pointer select-none flex items-center gap-1 hover:text-slate-700"
                    onClick={() => toggleSort('name')}
                  >
                    Nombre / Modelo
                    {sortConfig?.key === 'name' && <span className="text-indigo-600">{sortConfig.dir === 'asc' ? '↑' : '↓'}</span>}
                  </div>
                  {activeConfigCols.map(col => (
                    <div
                      key={col.key}
                      className="px-3 py-3 min-w-0 overflow-hidden cursor-pointer select-none flex items-center gap-1 hover:text-slate-700"
                      onClick={() => toggleSort(col.key)}
                    >
                      {col.label}
                      {sortConfig?.key === col.key && <span className="text-indigo-600">{sortConfig.dir === 'asc' ? '↑' : '↓'}</span>}
                    </div>
                  ))}
                  <div className="px-3 py-3" />
                  <div className="px-3 py-3 text-right">Acción</div>
                </div>

                {/* Filas de datos */}
                {sortedRows.map(({ dev, isSaved, devId }, rowIdx) => {
                  const hasStats = !!dev.cachedStats;
                  const isExpanded = expandedRows.has(dev.ip);
                  const rawMode = dev.cachedStats?.mode || dev.role;
                  const isAp = rawMode === 'ap' || rawMode === 'master';
                  const isSta = rawMode === 'sta';
                  const freq = dev.cachedStats?.frequency ?? dev.frequency;
                  const freqGhz = freq ? (freq / 1000).toFixed(1) : null;
                  const displayName = dev.cachedStats?.deviceName ?? (dev.name && dev.name !== dev.ip ? dev.name : null);
                  const displayModel = dev.cachedStats?.deviceModel || dev.model;
                  const displayMac = dev.cachedStats?.wlanMac || dev.mac;

                  return (
                    <Fragment key={dev.ip}>
                      {/* Fila principal */}
                      <div
                        style={{ display: 'grid', gridTemplateColumns: gridTemplate }}
                        className={`items-center border-b transition-colors
                        ${isSaved
                            ? `${rowIdx % 2 === 0 ? 'bg-indigo-50/20' : 'bg-indigo-50/40'} hover:bg-indigo-50/70 border-indigo-100`
                            : hasStats
                              ? `${rowIdx % 2 === 0 ? 'bg-emerald-50/25' : 'bg-emerald-50/50'} hover:bg-emerald-50/70 border-emerald-100`
                              : `${rowIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'} hover:bg-slate-50/80 border-slate-100`}
                        ${isExpanded ? 'border-b-indigo-200' : ''}`}
                      >
                        {/* SSH Status */}
                        <div className="px-2 py-2.5 flex items-center justify-center">
                          {sshStatus[dev.ip] === 'pending' && (
                            <Loader2 className="w-3.5 h-3.5 text-slate-300 animate-spin" />
                          )}
                          {sshStatus[dev.ip] === 'success' && (
                            <div
                              title={`SSH exitoso: ${dev.sshUser}`}
                              className="w-5 h-5 rounded-md bg-emerald-100 flex items-center justify-center border border-emerald-200"
                            >
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            </div>
                          )}
                          {sshStatus[dev.ip] === 'failed' && (
                            <div
                              title="Sin acceso SSH"
                              className="w-5 h-5 rounded-md bg-slate-100 flex items-center justify-center border border-slate-200"
                            >
                              <X className="w-3 h-3 text-slate-300" />
                            </div>
                          )}
                          {!sshStatus[dev.ip] && <div className="w-5 h-5" />}
                        </div>

                        {/* Rol + Frecuencia */}
                        <div className="px-3 py-2.5">
                          {(isAp || isSta) ? (
                            <span className={`inline-flex text-[10px] font-bold px-1.5 py-0.5 rounded-md
                            ${isAp ? 'bg-indigo-100 text-indigo-700' : 'bg-violet-100 text-violet-700'}`}>
                              {isAp ? 'AP' : 'CPE'}
                            </span>
                          ) : rawMode && rawMode !== 'unknown' ? (
                            <span className="inline-flex text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-500">
                              {String(rawMode).toUpperCase()}
                            </span>
                          ) : (
                            <span
                              className="text-[10px] text-slate-300"
                              title="Modo no detectado"
                            >—</span>
                          )}
                          {freqGhz && (
                            <p className={`text-[9px] font-bold mt-0.5 ${freq! >= 5000 ? 'text-sky-600' : 'text-amber-600'}`}>
                              {freqGhz}G
                            </p>
                          )}
                        </div>

                        {/* IP / MAC */}
                        <div className="px-3 py-3 min-w-0 pr-3">
                          <p className="font-mono text-sm font-semibold text-slate-700 truncate">{dev.ip}</p>
                          {displayMac
                            ? <p className="font-mono text-[9px] text-slate-400 truncate">{displayMac}</p>
                            : <p className="text-[9px] text-amber-500">SSH-only</p>
                          }
                        </div>

                        {/* Nombre / Modelo */}
                        <div className="px-3 py-3 min-w-0 pr-3">
                          {displayName && displayName !== dev.ip
                            ? <p className="text-sm font-bold text-slate-700 truncate" title={displayName}>{displayName}</p>
                            : <p className="text-sm font-semibold text-slate-400 truncate font-mono" title={dev.ip}>{dev.ip}</p>
                          }
                          <p className="text-[10px] text-slate-400 truncate" title={displayModel}>{displayModel || '—'}</p>
                        </div>

                        {/* Columnas configurables */}
                        {activeConfigCols.map(col => (
                          <div key={col.key} className="px-3 py-3 flex items-center text-sm">
                            {col.render(dev)}
                          </div>
                        ))}

                        {/* Expand toggle */}
                        <div className="px-1 py-2.5 flex items-center justify-center">
                          {hasStats && (
                            <button
                              onClick={() => setExpandedRows(prev => {
                                const next = new Set(prev);
                                if (next.has(dev.ip)) next.delete(dev.ip);
                                else next.add(dev.ip);
                                return next;
                              })}
                              title={isExpanded ? 'Ocultar detalle' : 'Ver estadísticas completas'}
                              className={`p-1 rounded-md transition-colors
                              ${isExpanded
                                  ? 'text-indigo-600 bg-indigo-100 hover:bg-indigo-200'
                                  : 'text-slate-300 hover:text-slate-500 hover:bg-slate-100'}`}
                            >
                              {isExpanded
                                ? <ChevronDown className="w-3.5 h-3.5" />
                                : <ChevronRight className="w-3.5 h-3.5" />
                              }
                            </button>
                          )}
                        </div>

                        {/* Acciones */}
                        <div className="px-3 py-3 flex items-center justify-end gap-1.5">
                          {/* Botón de datos SSH — siempre visible si hay stats */}
                          {hasStats && (
                            <button
                              onClick={() => setViewingRawDevice(dev)}
                              title="Ver todos los datos obtenidos por SSH"
                              className="flex items-center space-x-1 px-2 py-1.5 rounded-lg text-[11px] font-bold bg-slate-50 text-slate-500 hover:bg-slate-100 border border-slate-200 transition-all"
                            >
                              <Database className="w-2.5 h-2.5" />
                              <span>SSH</span>
                            </button>
                          )}

                          {isSaved ? (
                            <>
                              {/* Sincronizar stats frescas al dispositivo guardado */}
                              {hasStats && (
                                <button
                                  onClick={() => {
                                    const savedDev = savedDevices.find(s => s.id === devId);
                                    if (savedDev) {
                                      const updated: SavedDevice = {
                                        ...savedDev,
                                        cachedStats: dev.cachedStats,
                                        name: dev.cachedStats?.deviceName || savedDev.name,
                                        model: dev.cachedStats?.deviceModel || savedDev.model,
                                        firmware: dev.cachedStats?.firmwareVersion || savedDev.firmware,
                                        mac: dev.cachedStats?.wlanMac || savedDev.mac,
                                        essid: dev.cachedStats?.essid ?? savedDev.essid,
                                        frequency: dev.cachedStats?.frequency ?? savedDev.frequency,
                                        lastSeen: Date.now(),
                                      };
                                      handleUpdateDevice(updated);
                                      showToast('Stats actualizadas en el dispositivo guardado');
                                    }
                                  }}
                                  title="Sincronizar estadísticas frescas al dispositivo guardado"
                                  className="flex items-center space-x-1 px-2 py-1.5 rounded-lg text-[11px] font-bold bg-sky-50 text-sky-600 hover:bg-sky-100 border border-sky-200 transition-all"
                                >
                                  <RefreshCw className="w-2.5 h-2.5" />
                                  <span>Sync</span>
                                </button>
                              )}
                              {/* Abrir ficha guardada */}
                              <button
                                onClick={() => {
                                  const savedDev = savedDevices.find(s => s.id === devId);
                                  if (savedDev) setViewingDevice(savedDev);
                                }}
                                title="Ver ficha guardada"
                                className="flex items-center space-x-1 px-2 py-1.5 rounded-lg text-[11px] font-bold bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border border-indigo-200 transition-all"
                              >
                                <Eye className="w-2.5 h-2.5" />
                                <span>Ficha</span>
                              </button>
                            </>
                          ) : selectedNode ? (
                            // SSH verde con credenciales → guardar directo, sin modal
                            sshStatus[dev.ip] === 'success' && dev.sshUser ? (
                              <button
                                onClick={() => handleDirectSave(dev, selectedNode)}
                                title="Guardar con las credenciales SSH ya validadas"
                                className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm shadow-emerald-500/20 transition-all active:scale-[0.97] whitespace-nowrap"
                              >
                                <Check className="w-3 h-3" />
                                <span>Guardar</span>
                              </button>
                            ) : (
                              // Sin SSH o falló → pedir credenciales manualmente
                              <button
                                onClick={() => setAddingDevice(dev)}
                                title="Guardar dispositivo — ingresar credenciales SSH manualmente"
                                className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm shadow-indigo-500/20 transition-all active:scale-[0.97] whitespace-nowrap"
                              >
                                <PlusCircle className="w-3 h-3" />
                                <span>Guardar</span>
                              </button>
                            )
                          ) : (
                            <span className="text-[10px] text-slate-400 whitespace-nowrap">Sin nodo</span>
                          )}
                        </div>
                      </div>

                      {/* Panel de estadísticas expandido */}
                      {isExpanded && <ExpandedStats dev={dev} />}
                    </Fragment>
                  );
                })}
              </div>{/* fin minWidth wrapper */}
            </div>
          </div>
        )}
      </div>

      {/* Saved devices TABLE grouped by node */}
      {Object.keys(devicesByNode).length > 0 && (
        <div className="space-y-4">
          {Object.entries(devicesByNode).map(([nodeId, { nodeName, devices }]) => (
            <div key={nodeId} className="card overflow-hidden">
              {/* Node header */}
              <div className="flex items-center space-x-2 px-5 py-3 bg-slate-50 border-b border-slate-100">
                <Radio className="w-3.5 h-3.5 text-indigo-400" />
                <h3 className="text-sm font-bold text-slate-700">{nodeName}</h3>
                <span className="text-xs text-slate-400">· {devices.length} equipo{devices.length !== 1 ? 's' : ''}</span>
              </div>
              {/* Table header */}
              <div className="grid grid-cols-[72px_1fr_1fr_1fr_auto]
                px-5 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-wider
                border-b border-slate-100 bg-white">
                <span>Modo</span>
                <span>Nombre / MAC</span>
                <span>IP / Frec.</span>
                <span>SSID / AP</span>
                <span className="text-right">Acciones</span>
              </div>
              {/* Rows */}
              {devices.map((dev, devIdx) => {
                const rawMode = dev.cachedStats?.mode || (dev.role !== 'unknown' ? dev.role : null);
                const isApMode = rawMode === 'ap' || rawMode === 'master';
                const isCpe = rawMode === 'sta';
                const displayName = dev.deviceName || dev.name;
                const displayMac = dev.mac || '—';
                const antennaUrl = `http://${dev.ip}`;
                const routerUrl = `http://${dev.routerIp || dev.ip}:${dev.routerPort ?? 8075}`;
                return (
                  <div key={dev.id}
                    className={`grid grid-cols-[72px_1fr_1fr_1fr_auto]
                      items-center px-5 py-3 border-b border-slate-100 last:border-0 transition-colors
                      ${devIdx % 2 === 0 ? 'bg-white hover:bg-slate-50' : 'bg-slate-50/50 hover:bg-slate-50'}`}>
                    {/* Modo */}
                    <div>
                      {rawMode ? (
                        <span className={`inline-flex text-[10px] font-bold px-1.5 py-0.5 rounded-md
                          ${isApMode ? 'bg-indigo-100 text-indigo-700' : isCpe ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-500'}`}>
                          {isApMode ? 'AP' : isCpe ? 'CPE' : rawMode.toUpperCase()}
                        </span>
                      ) : (
                        <span
                          className="flex items-center gap-0.5 text-[10px] text-slate-400"
                          title="Sin datos de modo — abre el detalle y actualiza para detectarlo"
                        >
                          <AlertCircle className="w-3 h-3 text-amber-400 shrink-0" />
                          <span className="text-slate-300">Sin datos</span>
                        </span>
                      )}
                    </div>
                    {/* Nombre + MAC */}
                    <div className="min-w-0 pr-2">
                      <p className="text-xs font-semibold text-slate-800 truncate" title={displayName}>{displayName}</p>
                      <p className="font-mono text-[9px] text-slate-400 truncate">{displayMac}</p>
                    </div>
                    {/* IP + GHz */}
                    <div className="min-w-0 pr-2">
                      <p className="font-mono text-xs text-slate-600 truncate">{dev.ip}</p>
                      {dev.frequency ? (
                        <p className={`text-[9px] font-bold ${dev.frequency >= 5000 ? 'text-sky-600' : 'text-amber-600'}`}>
                          {(dev.frequency / 1000).toFixed(1)} GHz
                        </p>
                      ) : null}
                    </div>
                    {/* SSID (AP) o AP MAC (CPE) */}
                    <div className="min-w-0 pr-2">
                      {isApMode ? (
                        <>
                          {dev.essid && <p className="font-mono text-[11px] text-slate-600 truncate" title={dev.essid}>{dev.essid}</p>}
                          {dev.security && <p className="text-[9px] text-slate-400">{dev.security}</p>}
                        </>
                      ) : (
                        <>
                          {dev.apMac
                            ? <p className="font-mono text-[10px] text-violet-600 truncate" title={`AP: ${dev.apMac}`}>{dev.apMac}</p>
                            : dev.essid && <p className="font-mono text-[10px] text-slate-500 truncate">{dev.essid}</p>
                          }
                          {dev.lastSeen && (
                            <p className="text-[9px] text-slate-300">{new Date(dev.lastSeen).toLocaleDateString()}</p>
                          )}
                        </>
                      )}
                    </div>
                    {/* Acciones */}
                    <div className="flex items-center justify-end gap-0.5">
                      <a href={antennaUrl} target="_blank" rel="noopener noreferrer"
                        title={`Abrir antena: ${antennaUrl}`}
                        className="p-1.5 text-sky-600 hover:bg-sky-50 rounded-lg transition-colors flex items-center">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                      <a href={routerUrl} target="_blank" rel="noopener noreferrer"
                        title={`Abrir router: ${routerUrl}`}
                        className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors flex items-center">
                        <Router className="w-3.5 h-3.5" />
                      </a>
                      <button onClick={() => setViewingDevice(dev)} title="Ver stats antena"
                        className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setEditingDevice(dev)} title="Editar credenciales"
                        className="p-1.5 text-slate-500 hover:bg-slate-100 rounded-lg transition-colors">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleRemoveDevice(dev.id)} title="Eliminar"
                        className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {savedDevices.length === 0 && (
        <div className="card border-dashed border-2 border-slate-200 py-16 flex flex-col items-center text-center space-y-3">
          <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center">
            <Cpu className="w-7 h-7 text-indigo-400" />
          </div>
          <p className="text-slate-500 font-medium">Sin dispositivos guardados</p>
          <p className="text-slate-400 text-sm max-w-xs">
            Selecciona un nodo, ingresa su subred LAN y presiona "Escanear dispositivos"
          </p>
        </div>
      )}

      {/* Modal: datos SSH completos */}
      {viewingRawDevice && (
        <SshDataModal dev={viewingRawDevice} onClose={() => setViewingRawDevice(null)} />
      )}

      {/* Modal: añadir desde escáner — pre-rellena credenciales si ya se autenticó */}
      {addingDevice && selectedNode && (
        <AddDeviceModal
          device={addingDevice}
          node={selectedNode}
          existing={addingDevice.sshUser ? {
            sshUser: addingDevice.sshUser,
            sshPass: addingDevice.sshPass,
            sshPort: addingDevice.sshPort ?? 22,
          } : undefined}
          onSave={handleAddDevice}
          onClose={() => setAddingDevice(null)}
        />
      )}

      {/* Modal: editar dispositivo guardado */}
      {editingDevice && (
        <AddDeviceModal
          device={editingDevice}
          node={nodes.find(n => n.id === editingDevice.nodeId) ?? {
            id: editingDevice.nodeId,
            nombre_nodo: editingDevice.nodeName,
            ppp_user: '', segmento_lan: '', nombre_vrf: '',
            service: '', disabled: false, running: false,
            ip_tunnel: '', uptime: '',
          }}
          existing={{
            sshUser: editingDevice.sshUser,
            sshPass: editingDevice.sshPass,
            sshPort: editingDevice.sshPort,
            routerPort: editingDevice.routerPort,
          }}
          onSave={handleAddDevice}
          onClose={() => setEditingDevice(null)}
        />
      )}

      {/* Modal: ver ficha completa de dispositivo guardado */}
      {viewingDevice && (
        <DeviceCardModal
          device={viewingDevice}
          onClose={() => setViewingDevice(null)}
          onRemove={() => handleRemoveDevice(viewingDevice.id)}
          onUpdate={handleUpdateDevice}
        />
      )}
    </div>
  );
}
