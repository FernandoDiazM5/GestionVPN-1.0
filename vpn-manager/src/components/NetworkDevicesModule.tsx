import { useState, useEffect, useCallback, useRef, Fragment } from 'react';
import type { ReactNode } from 'react';
import {
  Cpu, RefreshCw, Loader2, Radio, AlertCircle,
  ShieldCheck, ShieldOff, PlusCircle, Check, X, Wifi, Info,
  Eye, Pencil, Trash2, CheckCircle2, ExternalLink, Router,
  Settings2, User, Lock, ChevronUp, ChevronDown, ChevronRight,
  SlidersHorizontal,
} from 'lucide-react';
import { useVpn } from '../context/VpnContext';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';
import { deviceDb } from '../store/deviceDb';
import DeviceCard from './DeviceCard';
import { API_BASE_URL } from '../config';
import type { ScannedDevice, SavedDevice } from '../types/devices';
import type { NodeInfo } from '../types/api';

const SESSION_SCAN_KEY = 'vpn_scan_results_v1';
const COLS_STORAGE_KEY  = 'vpn_diag_cols_v1';

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
    label: 'SSID',
    width: '1fr',
    defaultVisible: true,
    requiresStats: false,
    render: (dev) => {
      const v = dev.cachedStats?.essid ?? dev.essid;
      return v
        ? <span className="font-mono text-[11px] text-slate-600 truncate block" title={v}>{v}</span>
        : <span className="text-[10px] text-slate-300">—</span>;
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-5 max-h-[90vh] overflow-y-auto">
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
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center space-x-1">
            <Cpu className="w-3 h-3" /><span>SSH — Antena Ubiquiti</span>
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Usuario</label>
              <input value={sshUser} onChange={e => setSshUser(e.target.value)} className="input-field w-full text-xs" placeholder="ubnt" />
            </div>
            <div>
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Puerto SSH</label>
              <input type="number" value={sshPort} onChange={e => setSshPort(+e.target.value)} className="input-field w-full text-xs" />
            </div>
          </div>
          <div>
            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Clave SSH</label>
            <input type="password" value={sshPass} onChange={e => setSshPass(e.target.value)} className="input-field w-full text-xs" placeholder="contraseña SSH" />
          </div>
        </div>

        {/* Puerto WebUI router */}
        <div className="space-y-2">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center space-x-1">
            <Wifi className="w-3 h-3" /><span>Router del cliente</span>
          </p>
          <div>
            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Puerto WebUI <span className="normal-case font-normal text-slate-300">(acceso en {device.ip}:puerto)</span>
            </label>
            <input type="number" value={routerPort} onChange={e => setRouterPort(+e.target.value)} className="input-field w-full text-xs" />
          </div>
        </div>

        {/* Nodo */}
        <div className="bg-slate-50 rounded-xl p-3 flex items-center space-x-2">
          <Radio className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
          <div>
            <p className="text-[10px] text-slate-400">Nodo asociado</p>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl">
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

  if (!s) {
    return (
      <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 text-xs text-slate-400 italic">
        Sin estadísticas SSH disponibles para este dispositivo.
      </div>
    );
  }

  type StatItem = { label: string; value: string | null; color?: string; mono?: boolean };

  const snr = s.signal != null && s.noiseFloor != null ? s.signal - s.noiseFloor : null;

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
    { label: 'TX Rate',   value: s.txRate  != null ? `${s.txRate} Mbps`  : null, mono: true },
    { label: 'RX Rate',   value: s.rxRate  != null ? `${s.rxRate} Mbps`  : null, mono: true },
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
    { label: 'Uptime',   value: s.uptimeStr     || null, mono: true },
    { label: 'TX Power', value: s.txPower != null ? `${s.txPower} dBm`   : null, mono: true },
    { label: 'Canal',    value: s.channelWidth != null ? `${s.channelWidth} MHz` : null, mono: true },
    { label: 'Modo Red', value: s.networkMode   || null },
    { label: 'Seguridad',value: s.security      || null },
    { label: 'Chains',   value: s.chains        || null, mono: true },
    { label: 'Firmware', value: s.firmwareVersion || dev.firmware || null },
    { label: 'Estaciones', value: s.stations?.length != null ? String(s.stations.length) : null },
  ].filter(i => i.value != null && i.value !== '') as (StatItem & { value: string })[];

  return (
    <div className="px-5 py-4 bg-gradient-to-r from-slate-50 to-indigo-50/30 border-t border-slate-200">
      {/* Header del panel */}
      <div className="flex items-center space-x-2 mb-3">
        <div className="w-1 h-4 bg-indigo-400 rounded-full" />
        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">
          Estadísticas completas · {dev.ip}
        </span>
        {dev.sshUser && (
          <span className="text-[9px] font-mono text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-md border border-emerald-200">
            {dev.sshUser}
          </span>
        )}
      </div>

      {/* Grid de stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-1.5">
        {items.map(item => (
          <div key={item.label} className="bg-white rounded-lg px-2.5 py-2 border border-slate-100 shadow-sm">
            <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">{item.label}</p>
            <p className={`text-xs font-bold truncate ${item.color ?? 'text-slate-700'} ${item.mono ? 'font-mono' : ''}`}>
              {item.value}
            </p>
          </div>
        ))}
      </div>

      {/* Estaciones del AP */}
      {s.stations && s.stations.length > 0 && (
        <div className="mt-3">
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
            Estaciones conectadas ({s.stations.length})
          </p>
          <div className="flex flex-wrap gap-1.5">
            {s.stations.map((sta, i) => (
              <div key={i} className="bg-white border border-slate-100 rounded-lg px-2.5 py-1.5 flex items-center space-x-2 shadow-sm">
                <span className="font-mono text-[10px] text-slate-600">{sta.mac}</span>
                {sta.signal != null && (
                  <span className={`text-[10px] font-bold ${sta.signal >= -65 ? 'text-emerald-500' : sta.signal >= -75 ? 'text-sky-500' : 'text-amber-500'}`}>
                    {sta.signal} dBm
                  </span>
                )}
                {sta.ccq    != null && <span className="text-[10px] text-slate-400">{sta.ccq}%</span>}
                {sta.txRate != null && <span className="font-mono text-[10px] text-slate-400">{sta.txRate}↑</span>}
                {sta.rxRate != null && <span className="font-mono text-[10px] text-slate-400">{sta.rxRate}↓</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Selector de columnas ─────────────────────────────────────────────────
interface ColumnPickerProps {
  visibleColumns: Set<string>;
  onChange: (cols: Set<string>) => void;
}

function ColumnPicker({ visibleColumns, onChange }: ColumnPickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggle = (key: string) => {
    const next = new Set(visibleColumns);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange(next);
  };

  const visibleCount = COLUMN_DEFS.filter(c => visibleColumns.has(c.key)).length;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 border border-slate-200 transition-colors"
      >
        <SlidersHorizontal className="w-3.5 h-3.5" />
        <span>Columnas</span>
        <span className="bg-indigo-100 text-indigo-600 text-[9px] font-black px-1.5 py-0.5 rounded-md min-w-[18px] text-center">
          {visibleCount}
        </span>
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 z-30 bg-white border border-slate-200 rounded-xl shadow-xl p-3 w-52">
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-2">
            Columnas opcionales
          </p>
          <div className="space-y-0.5">
            {COLUMN_DEFS.map(col => (
              <label
                key={col.key}
                className="flex items-center space-x-2 py-1 px-1.5 rounded-lg hover:bg-slate-50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={visibleColumns.has(col.key)}
                  onChange={() => toggle(col.key)}
                  className="w-3.5 h-3.5 rounded accent-indigo-600"
                />
                <span className="text-xs text-slate-600 flex-1">{col.label}</span>
                {col.requiresStats && (
                  <span className="text-[8px] font-bold text-slate-300 uppercase">SSH</span>
                )}
              </label>
            ))}
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 flex gap-1.5">
            <button
              onClick={() => onChange(new Set(COLUMN_DEFS.map(c => c.key)))}
              className="flex-1 text-[10px] font-bold text-indigo-600 hover:text-indigo-700 transition-colors"
            >
              Todas
            </button>
            <span className="text-slate-200">|</span>
            <button
              onClick={() => onChange(new Set(COLUMN_DEFS.filter(c => c.defaultVisible).map(c => c.key)))}
              className="flex-1 text-[10px] font-bold text-slate-400 hover:text-slate-600 transition-colors"
            >
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

  const [savedDevices, setSavedDevices]     = useState<SavedDevice[]>([]);
  const [scanResults,  setScanResults]      = useState<ScannedDevice[]>([]);
  const [allScannedIPs, setAllScannedIPs]   = useState<string[]>([]);
  const [scannedCount, setScannedCount]     = useState(0);
  const [debugMsg,     setDebugMsg]         = useState('');
  const [scanError,    setScanError]        = useState('');
  const [selectedNode, setSelectedNode]     = useState<NodeInfo | null>(null);
  const [manualLan,    setManualLan]        = useState('');
  const [addingDevice, setAddingDevice]     = useState<ScannedDevice | null>(null);
  const [editingDevice, setEditingDevice]   = useState<SavedDevice | null>(null);
  const [viewingDevice, setViewingDevice]   = useState<SavedDevice | null>(null);

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

  // Columnas visibles — persisten en localStorage
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(COLS_STORAGE_KEY);
      if (saved) return new Set(JSON.parse(saved) as string[]);
    } catch { /* silent */ }
    return new Set(COLUMN_DEFS.filter(c => c.defaultVisible).map(c => c.key));
  });

  const [savedIds,        setSavedIds]        = useState<Set<string>>(new Set());
  const [isLoadingNodes,  setIsLoadingNodes]   = useState(false);
  const [toast,           setToast]            = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const [showCredsConfig, setShowCredsConfig] = useState(false);
  const [scanCreds, setScanCreds] = useState<ScanCred[]>(() => {
    const saved = localStorage.getItem('vpn_scan_creds_v1');
    return saved ? JSON.parse(saved) : [{ user: 'ubnt', pass: 'ubnt' }];
  });

  useEffect(() => {
    localStorage.setItem('vpn_scan_creds_v1', JSON.stringify(scanCreds));
  }, [scanCreds]);

  const saveVisibleColumns = (cols: Set<string>) => {
    setVisibleColumns(cols);
    try { localStorage.setItem(COLS_STORAGE_KEY, JSON.stringify([...cols])); } catch { /* silent */ }
  };

  const moveCredUp = (index: number) => {
    if (index === 0) return;
    const newCreds = [...scanCreds];
    [newCreds[index - 1], newCreds[index]] = [newCreds[index], newCreds[index - 1]];
    setScanCreds(newCreds);
  };

  const moveCredDown = (index: number) => {
    if (index === scanCreds.length - 1) return;
    const newCreds = [...scanCreds];
    [newCreds[index + 1], newCreds[index]] = [newCreds[index], newCreds[index + 1]];
    setScanCreds(newCreds);
  };

  const showToast = (msg: string) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 4000);
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
    setIsLoadingNodes(true);
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
    } finally {
      setIsLoadingNodes(false);
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
        if (active.segmento_lan) setManualLan(active.segmento_lan);
      }
    }
  }, [activeNodeVrf, nodes]);

  const effectiveLan = manualLan.trim() || selectedNode?.segmento_lan || '';

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

  // ── handleScan: Fase 1 descubrimiento + Fase 2 auto-login SOBRE TODOS ──
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
      // ── FASE 1: DESCUBRIMIENTO ───────────────────────────────────────
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

      // ── FASE 2: AUTO-LOGIN SOBRE TODOS LOS DISPOSITIVOS ─────────────
      if (discoveredDevices.length > 0) {
        // Marcar todos como pendientes
        const initialStatus: Record<string, SshAuthStatus> = {};
        discoveredDevices.forEach(d => { initialStatus[d.ip] = 'pending'; });
        setSshStatus(initialStatus);
        setScanState({ phase: 'authenticating', current: 0, total: discoveredDevices.length });

        const baseCreds = scanCreds.filter(c => c.user && c.pass);
        let completed = 0;
        const batchSize = 3;

        for (let i = 0; i < discoveredDevices.length; i += batchSize) {
          const batch = discoveredDevices.slice(i, i + batchSize);

          await Promise.all(batch.map(async (dev) => {
            try {
              // Para dispositivos ya guardados, intentar sus credenciales conocidas primero
              const devId = dev.mac ? dev.mac.replace(/:/g, '') : dev.ip.replace(/\./g, '');
              const savedDev = savedDevices.find(s => s.id === devId);

              let effectiveCreds = baseCreds;
              if (savedDev?.sshUser && savedDev?.sshPass) {
                const knownCred = { user: savedDev.sshUser, pass: savedDev.sshPass };
                const others = baseCreds.filter(c => !(c.user === knownCred.user && c.pass === knownCred.pass));
                effectiveCreds = [knownCred, ...others];
              }

              // Sin credenciales disponibles → marcar fallido sin petición HTTP
              if (effectiveCreds.length === 0) {
                setSshStatus(prev => ({ ...prev, [dev.ip]: 'failed' }));
                return;
              }

              const authRes = await fetchWithTimeout(`${API_BASE_URL}/api/device/auto-login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ip: dev.ip, sshCredentials: effectiveCreds }),
              }, 45_000);
              const authData = await authRes.json();

              if (authData.success && authData.stats) {
                setSshStatus(prev => ({ ...prev, [dev.ip]: 'success' }));
                // Enriquecer el ScannedDevice con datos del SSH en tiempo real
                setScanResults(prev => {
                  const next = [...prev];
                  const idx  = next.findIndex(d => d.ip === dev.ip);
                  if (idx !== -1) {
                    next[idx] = {
                      ...next[idx],
                      sshUser:     authData.user,
                      sshPass:     authData.pass,
                      sshPort:     authData.port,
                      cachedStats: authData.stats,
                      name:        authData.stats.deviceName     || next[idx].name,
                      model:       authData.stats.deviceModel    || next[idx].model,
                      firmware:    authData.stats.firmwareVersion || next[idx].firmware,
                      mac:         authData.stats.wlanMac        || next[idx].mac,
                      essid:       authData.stats.essid          || next[idx].essid,
                      frequency:   authData.stats.frequency      || next[idx].frequency,
                      role:        authData.stats.mode           || next[idx].role,
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
      }

      setScanState(s => ({ ...s, phase: 'done' }));
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
            apMac: s.apMac ?? merged.apMac, cachedStats: s,
          };
          setSavedDevices(prev => prev.map(d => d.id === enriched.id ? enriched : d));
          await deviceDb.saveSingle(enriched);
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
  const canScan  = (scanState.phase === 'idle' || scanState.phase === 'done') && !!effectiveLan;
  const isScanning = scanState.phase === 'discovering' || scanState.phase === 'authenticating';

  // Todos los dispositivos escaneados, marcando cuáles están guardados
  const scanRows = scanResults.map(dev => {
    const id = dev.mac ? dev.mac.replace(/:/g, '') : dev.ip.replace(/\./g, '');
    return { dev, isSaved: savedIds.has(id), devId: id };
  });

  const devicesByNode = savedDevices.reduce<Record<string, { nodeName: string; devices: SavedDevice[] }>>((acc, d) => {
    if (!acc[d.nodeId]) acc[d.nodeId] = { nodeName: d.nodeName, devices: [] };
    acc[d.nodeId].devices.push(d);
    return acc;
  }, {});

  // Grid template dinámico para la tabla de diagnóstico
  const activeConfigCols = COLUMN_DEFS.filter(c => visibleColumns.has(c.key));
  const gridTemplate = [
    '40px',   // SSH status
    '54px',   // Rol / freq
    '148px',  // IP / MAC
    '1fr',    // Nombre / Modelo
    ...activeConfigCols.map(c => c.width),
    '32px',   // Expand toggle
    '144px',  // Acciones
  ].join(' ');

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
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-700 flex items-center space-x-2">
            <RefreshCw className="w-4 h-4 text-indigo-500" />
            <span>Escanear LAN del nodo</span>
          </h3>
          <button onClick={loadNodes} disabled={isLoadingNodes}
            className="flex items-center space-x-1.5 text-xs font-semibold text-slate-500 hover:text-indigo-600 transition-colors disabled:opacity-50">
            {isLoadingNodes ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            <span>{isLoadingNodes ? 'Cargando...' : `Recargar nodos (${nodes.length})`}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Nodo</label>
            <select
              value={selectedNode?.id ?? ''}
              onChange={e => {
                const n = nodes.find(x => x.id === e.target.value) ?? null;
                setSelectedNode(n);
                if (n?.segmento_lan) setManualLan(n.segmento_lan);
              }}
              className="input-field w-full text-sm"
            >
              <option value="">{nodes.length === 0 ? 'Cargando nodos...' : 'Seleccionar nodo...'}</option>
              {nodes.map(n => (
                <option key={n.id} value={n.id}>
                  {n.nombre_nodo}{n.segmento_lan ? ` — ${n.segmento_lan}` : ''}{!n.running ? ' (offline)' : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
              Subred LAN (CIDR)
            </label>
            <input
              value={manualLan}
              onChange={e => setManualLan(e.target.value)}
              placeholder="ej: 10.5.5.0/24"
              className="input-field w-full text-sm font-mono"
            />
          </div>
        </div>

        {/* Configuración Auto-Login Desplegable */}
        <div className="border-t border-slate-100 pt-3 mt-1">
          <button onClick={() => setShowCredsConfig(!showCredsConfig)}
            className="text-[11px] text-indigo-600 hover:text-indigo-700 font-bold flex items-center space-x-1.5 transition-colors">
            <Settings2 className="w-3.5 h-3.5" />
            <span>Configurar Auto-Login (Contraseñas SSH)</span>
          </button>

          {showCredsConfig && (
            <div className="mt-3 bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
              <p className="text-[10px] text-slate-500 max-w-xl leading-relaxed">
                Agrega los usuarios y contraseñas comunes de tus antenas. El sistema las probará en orden (de arriba hacia abajo). Pon tu clave más común en el 1º lugar.
                <strong className="text-amber-600 block mt-1">Nota: Más contraseñas aumentarán el tiempo de escaneo.</strong>
              </p>
              <div className="space-y-2.5">
                {scanCreds.map((cred, i) => (
                  <div key={i} className="flex items-center gap-2 bg-white p-2 rounded-xl border border-slate-200 shadow-sm transition-all hover:border-indigo-300">
                    <span className="text-[10px] font-black text-slate-400 w-4 text-center">{i + 1}º</span>
                    <div className="relative flex-1">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                      <input
                        type="text" placeholder="Usuario (ej: ubnt)" value={cred.user}
                        onChange={e => { const c = [...scanCreds]; c[i].user = e.target.value; setScanCreds(c); }}
                        className="w-full pl-8 pr-2 py-1.5 bg-slate-50 border border-transparent focus:bg-white focus:border-indigo-300 rounded-lg text-xs outline-none transition-all text-slate-700 font-semibold"
                      />
                    </div>
                    <div className="relative flex-1">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                      <input
                        type="password" placeholder="Contraseña" value={cred.pass}
                        onChange={e => { const c = [...scanCreds]; c[i].pass = e.target.value; setScanCreds(c); }}
                        className="w-full pl-8 pr-2 py-1.5 bg-slate-50 border border-transparent focus:bg-white focus:border-indigo-300 rounded-lg text-xs outline-none transition-all text-slate-700 font-mono"
                      />
                    </div>
                    <div className="flex flex-col items-center gap-0.5 border-l border-slate-100 pl-1.5 ml-0.5">
                      <button onClick={() => moveCredUp(i)} disabled={i === 0} title="Subir prioridad"
                        className="p-0.5 text-slate-300 hover:text-indigo-600 disabled:opacity-30 transition-colors">
                        <ChevronUp className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => moveCredDown(i)} disabled={i === scanCreds.length - 1} title="Bajar prioridad"
                        className="p-0.5 text-slate-300 hover:text-indigo-600 disabled:opacity-30 transition-colors">
                        <ChevronDown className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <button onClick={() => setScanCreds(scanCreds.filter((_, idx) => idx !== i))}
                      title="Eliminar credencial"
                      className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors shrink-0 ml-0.5">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
              <button onClick={() => { if (scanCreds.length < 5) setScanCreds([...scanCreds, { user: 'ubnt', pass: '' }]) }}
                disabled={scanCreds.length >= 5}
                className="flex items-center space-x-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-800 disabled:opacity-50">
                <PlusCircle className="w-3.5 h-3.5" /> <span>Añadir Credencial ({scanCreds.length}/5)</span>
              </button>
            </div>
          )}
        </div>

        <button onClick={handleScan} disabled={!canScan}
          className={`flex items-center space-x-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all
            ${canScan
              ? 'bg-gradient-to-r from-indigo-500 to-indigo-600 text-white shadow-md shadow-indigo-500/25 hover:shadow-lg active:scale-[0.98]'
              : 'bg-slate-100 text-slate-300 cursor-not-allowed'}`}
        >
          {isScanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          <span>{isScanning ? `Escaneando ${effectiveLan}...` : 'Escanear dispositivos'}</span>
        </button>

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
                  {scanState.phase === 'discovering'   ? 'Buscando dispositivos en la red...' :
                   scanState.phase === 'authenticating' ? 'Probando accesos SSH y extrayendo datos...' :
                                                          'Escaneo finalizado exitosamente'}
                </span>
              </span>
              {scanState.phase === 'authenticating' && (
                <span className="text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded-md font-mono">
                  {scanState.current} / {scanState.total}
                </span>
              )}
            </div>

            <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden relative">
              {scanState.phase === 'discovering' && (
                <div className="absolute top-0 left-0 h-full w-full bg-indigo-500 animate-pulse" />
              )}
              {scanState.phase === 'authenticating' && (
                <div
                  className="h-full transition-all duration-300 ease-out shadow-sm bg-indigo-500"
                  style={{ width: `${(scanState.current / scanState.total) * 100}%` }}
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
              <ColumnPicker visibleColumns={visibleColumns} onChange={saveVisibleColumns} />
            </div>

            {/* Tabla con columnas dinámicas */}
            <div className="rounded-xl overflow-hidden border border-slate-200 overflow-x-auto">

              {/* Fila de cabecera */}
              <div
                className="bg-slate-50 border-b border-slate-200 text-[9px] font-bold text-slate-400 uppercase tracking-wider"
                style={{ display: 'grid', gridTemplateColumns: gridTemplate }}
              >
                <div className="px-2 py-2 text-center">SSH</div>
                <div className="px-2 py-2">Rol</div>
                <div className="px-2 py-2">IP / MAC</div>
                <div className="px-2 py-2">Nombre / Modelo</div>
                {activeConfigCols.map(col => (
                  <div key={col.key} className="px-2 py-2">{col.label}</div>
                ))}
                <div className="px-2 py-2" />
                <div className="px-2 py-2 text-right">Acción</div>
              </div>

              {/* Filas de datos */}
              {scanRows.map(({ dev, isSaved, devId }) => {
                const hasStats  = !!dev.cachedStats;
                const isExpanded = expandedRows.has(dev.ip);
                const rawMode   = dev.cachedStats?.mode || dev.role;
                const isAp      = rawMode === 'ap' || rawMode === 'master';
                const isSta     = rawMode === 'sta';
                const freq      = dev.cachedStats?.frequency ?? dev.frequency;
                const freqGhz   = freq ? (freq / 1000).toFixed(1) : null;
                const displayName  = dev.cachedStats?.deviceName || dev.name;
                const displayModel = dev.cachedStats?.deviceModel || dev.model;
                const displayMac   = dev.cachedStats?.wlanMac || dev.mac;

                return (
                  <Fragment key={dev.ip}>
                    {/* Fila principal */}
                    <div
                      style={{ display: 'grid', gridTemplateColumns: gridTemplate }}
                      className={`items-center border-b transition-colors
                        ${isSaved
                          ? 'bg-indigo-50/30 hover:bg-indigo-50/60 border-indigo-100'
                          : hasStats
                            ? 'bg-emerald-50/40 hover:bg-emerald-50/70 border-emerald-100'
                            : 'hover:bg-slate-50/80 border-slate-100'}
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
                            className="w-5 h-5 rounded-md bg-rose-50 flex items-center justify-center border border-rose-100"
                          >
                            <X className="w-3 h-3 text-rose-400" />
                          </div>
                        )}
                        {!sshStatus[dev.ip] && <div className="w-5 h-5" />}
                      </div>

                      {/* Rol + Frecuencia */}
                      <div className="px-2 py-2.5">
                        <span className={`inline-flex text-[10px] font-bold px-1.5 py-0.5 rounded-md
                          ${isAp  ? 'bg-indigo-100 text-indigo-700'
                          : isSta ? 'bg-violet-100 text-violet-700'
                                  : 'bg-slate-100 text-slate-500'}`}>
                          {isAp ? 'AP' : isSta ? 'CPE' : rawMode === 'unknown' ? '?' : String(rawMode).toUpperCase()}
                        </span>
                        {freqGhz && (
                          <p className={`text-[9px] font-bold mt-0.5 ${freq! >= 5000 ? 'text-sky-600' : 'text-amber-600'}`}>
                            {freqGhz}G
                          </p>
                        )}
                      </div>

                      {/* IP / MAC */}
                      <div className="px-2 py-2.5 min-w-0 pr-3">
                        <p className="font-mono text-xs text-slate-700 truncate">{dev.ip}</p>
                        {displayMac
                          ? <p className="font-mono text-[9px] text-slate-400 truncate">{displayMac}</p>
                          : <p className="text-[9px] text-amber-500">SSH-only</p>
                        }
                      </div>

                      {/* Nombre / Modelo */}
                      <div className="px-2 py-2.5 min-w-0 pr-3">
                        <p className="text-xs font-semibold text-slate-700 truncate" title={displayName}>{displayName}</p>
                        <p className="text-[10px] text-slate-400 truncate" title={displayModel}>{displayModel}</p>
                      </div>

                      {/* Columnas configurables */}
                      {activeConfigCols.map(col => (
                        <div key={col.key} className="px-2 py-2.5 flex items-center">
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
                              ? <ChevronDown  className="w-3.5 h-3.5" />
                              : <ChevronRight className="w-3.5 h-3.5" />
                            }
                          </button>
                        )}
                      </div>

                      {/* Acciones */}
                      <div className="px-2 py-2.5 flex items-center justify-end gap-1.5">
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
                                      cachedStats:  dev.cachedStats,
                                      name:         dev.cachedStats?.deviceName     || savedDev.name,
                                      model:        dev.cachedStats?.deviceModel    || savedDev.model,
                                      firmware:     dev.cachedStats?.firmwareVersion || savedDev.firmware,
                                      mac:          dev.cachedStats?.wlanMac        || savedDev.mac,
                                      essid:        dev.cachedStats?.essid          ?? savedDev.essid,
                                      frequency:    dev.cachedStats?.frequency      ?? savedDev.frequency,
                                      lastSeen:     Date.now(),
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
                          <button
                            onClick={() => setAddingDevice(dev)}
                            className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm shadow-indigo-500/20 transition-all active:scale-[0.97] whitespace-nowrap"
                          >
                            <PlusCircle className="w-3 h-3" />
                            <span>Guardar</span>
                          </button>
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
              {devices.map(dev => {
                const rawMode  = dev.cachedStats?.mode || (dev.role !== 'unknown' ? dev.role : null);
                const isApMode = rawMode === 'ap' || rawMode === 'master';
                const isCpe    = rawMode === 'sta';
                const displayName = dev.deviceName || dev.name;
                const displayMac  = dev.mac || '—';
                const antennaUrl  = `http://${dev.ip}`;
                const routerUrl   = `http://${dev.routerIp || dev.ip}:${dev.routerPort ?? 8075}`;
                return (
                  <div key={dev.id}
                    className="grid grid-cols-[72px_1fr_1fr_1fr_auto]
                      items-center px-5 py-3 border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
                    {/* Modo */}
                    <div>
                      {rawMode ? (
                        <span className={`inline-flex text-[10px] font-bold px-1.5 py-0.5 rounded-md
                          ${isApMode ? 'bg-indigo-100 text-indigo-700' : isCpe ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-500'}`}>
                          {isApMode ? 'AP' : isCpe ? 'CPE' : rawMode.toUpperCase()}
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-300" title="Abre el detalle y presiona Actualizar">—</span>
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
                          {dev.essid   && <p className="font-mono text-[11px] text-slate-600 truncate" title={dev.essid}>{dev.essid}</p>}
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

      {/* Modal: añadir desde escáner */}
      {addingDevice && selectedNode && (
        <AddDeviceModal
          device={addingDevice}
          node={selectedNode}
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
            sshUser:    editingDevice.sshUser,
            sshPass:    editingDevice.sshPass,
            sshPort:    editingDevice.sshPort,
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
