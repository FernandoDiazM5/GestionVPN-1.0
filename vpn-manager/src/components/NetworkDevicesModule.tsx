import { useState, useEffect, useCallback, useRef, Fragment, useMemo } from 'react';
import { apiFetch } from '../utils/apiClient';
import type { ReactNode } from 'react';
import {
  Cpu, RefreshCw, Loader2, Radio, AlertCircle,
  ShieldCheck, ShieldOff, Check, X, Wifi, Info,
  Eye, CheckCircle2, ChevronUp, ChevronDown, ChevronRight, PlusCircle,
  SlidersHorizontal, Database, Search, KeyRound,
  Activity, Shield, Network, GripVertical, Copy,
} from 'lucide-react';
import { useVpn } from '../context/VpnContext';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';
import { deviceDb } from '../store/deviceDb';
import DeviceCard from './DeviceCard';
import { API_BASE_URL } from '../config';
import type { ScannedDevice, SavedDevice, AntennaStats } from '../types/devices';
import type { NodeInfo } from '../types/api';

const SESSION_SCAN_KEY = 'vpn_scan_results_v1';
const COLS_STORAGE_KEY = 'vpn_diag_cols_v2';

// Estima el número de hosts en un CIDR (ej: 192.168.1.0/24 → 254)
const estimateIpCount = (cidr: string): number => {
  const m = cidr.match(/\/(\d+)$/);
  if (!m) return 254;
  const prefix = parseInt(m[1]);
  return Math.max(2, (1 << (32 - prefix)) - 2);
};

// Verifica si una IP está dentro de un bloque CIDR (ej: 10.1.1.5 en 10.1.1.0/24)
const ipInCidr = (ip: string, cidr: string): boolean => {
  if (!ip || !cidr) return false;
  try {
    const [net, bits] = cidr.split('/');
    if (!net || !bits) return false;
    const b = 32 - parseInt(bits);
    const mask = b >= 32 ? 0 : (~((1 << b) - 1)) >>> 0;
    const toInt = (s: string) => s.split('.').reduce((a, o) => ((a << 8) >>> 0) + parseInt(o), 0) >>> 0;
    return (toInt(ip) & mask) === (toInt(net) & mask);
  } catch { return false; }
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
    label: 'TX Rate',
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
    label: 'RX Rate',
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
    label: 'Piso Ruido',
    width: '76px',
    defaultVisible: true,
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
    defaultVisible: true,
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
    defaultVisible: true,
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
    label: 'Calidad AM',
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
    label: 'Capacidad AM',
    width: '80px',
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
    label: 'Tiempo Activo',
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
    label: 'Potencia TX',
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
    label: 'Ancho Canal',
    width: '76px',
    defaultVisible: false,
    requiresStats: true,
    render: (dev) => {
      const v = dev.cachedStats?.channelWidth;
      if (v == null) return <span className="text-[10px] text-slate-300">—</span>;
      return <span className="font-mono text-xs text-slate-500">{v} MHz</span>;
    },
  },
  {
    key: 'rssi',
    label: 'RSSI bruto',
    width: '76px',
    defaultVisible: false,
    requiresStats: true,
    render: (dev) => {
      const v = dev.cachedStats?.rssi ?? dev.cachedStats?.signal;
      if (v == null) return <span className="text-[10px] text-slate-300">—</span>;
      const c = v >= -65 ? 'text-emerald-600' : v >= -75 ? 'text-sky-600' : 'text-amber-500';
      return <span className={`font-mono font-bold text-xs ${c}`}>{v} dBm</span>;
    },
  },
  {
    key: 'distance',
    label: 'Distancia',
    width: '84px',
    defaultVisible: false,
    requiresStats: true,
    render: (dev) => {
      const v = dev.cachedStats?.distance;
      if (v == null) return <span className="text-[10px] text-slate-300">—</span>;
      const m = parseInt(String(v));
      return <span className="font-mono text-xs text-slate-500">{m >= 1000 ? `${(m/1000).toFixed(2)} km` : `${m} m`}</span>;
    },
  },
  {
    key: 'frequency',
    label: 'Frecuencia',
    width: '80px',
    defaultVisible: false,
    requiresStats: false,
    render: (dev) => {
      const v = dev.cachedStats?.frequency ?? dev.frequency;
      if (!v) return <span className="text-[10px] text-slate-300">—</span>;
      return <span className="font-mono text-xs text-slate-500">{v} MHz</span>;
    },
  },
  {
    key: 'hostname',
    label: 'Nombre Dispositivo',
    width: 'minmax(100px,1fr)',
    defaultVisible: false,
    requiresStats: true,
    render: (dev) => {
      const v = dev.cachedStats?.deviceName ?? dev.name;
      if (!v) return <span className="text-[10px] text-slate-300">—</span>;
      return <span className="font-mono text-[10px] text-slate-600 truncate block" title={v}>{v}</span>;
    },
  },
  {
    key: 'firmware',
    label: 'Versión FW',
    width: '90px',
    defaultVisible: false,
    requiresStats: true,
    render: (dev) => {
      const v = dev.cachedStats?.firmwareVersion ?? dev.firmware;
      if (!v) return <span className="text-[10px] text-slate-300">—</span>;
      return <span className="font-mono text-[10px] text-slate-500 truncate block" title={v}>{v}</span>;
    },
  },
  {
    key: 'chains',
    label: 'Cadenas TX/RX',
    width: '80px',
    defaultVisible: false,
    requiresStats: true,
    render: (dev) => {
      const v = dev.cachedStats?.chains;
      if (!v) return <span className="text-[10px] text-slate-300">—</span>;
      return <span className="font-mono text-xs text-slate-500">{v}</span>;
    },
  },
  {
    key: 'security',
    label: 'Seguridad',
    width: '80px',
    defaultVisible: false,
    requiresStats: true,
    render: (dev) => {
      const v = dev.cachedStats?.security;
      if (!v) return <span className="text-[10px] text-slate-300">—</span>;
      return <span className="font-mono text-[10px] text-slate-500 uppercase">{v}</span>;
    },
  },
  {
    key: 'txretries',
    label: 'Reintentos TX',
    width: '80px',
    defaultVisible: false,
    requiresStats: true,
    render: (dev) => {
      const v = dev.cachedStats?.txRetries;
      if (v == null) return <span className="text-[10px] text-slate-300">—</span>;
      const c = v < 100 ? 'text-emerald-600' : v < 500 ? 'text-amber-500' : 'text-rose-500';
      return <span className={`font-mono text-xs ${c}`}>{v}</span>;
    },
  },
  {
    key: 'opmode',
    label: 'Modo WiFi HT',
    width: '84px',
    defaultVisible: false,
    requiresStats: true,
    render: (dev) => {
      const v = dev.cachedStats?.opmode;
      if (!v) return <span className="text-[10px] text-slate-300">—</span>;
      return <span className="font-mono text-[10px] text-slate-500">{v}</span>;
    },
  },
  {
    key: 'country',
    label: 'País/Región',
    width: '72px',
    defaultVisible: false,
    requiresStats: true,
    render: (dev) => {
      const v = dev.cachedStats?.countryCode;
      if (!v) return <span className="text-[10px] text-slate-300">—</span>;
      return <span className="font-mono text-[10px] text-slate-500">{v}</span>;
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
      role: (device.role === 'ap' || (device.role as string) === 'master') ? 'ap' : device.role === 'sta' ? 'sta' : 'unknown',
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

        {/* Advertencia de subred incorrecta */}
        {node.segmento_lan && !ipInCidr(device.ip, node.segmento_lan) && (
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
            <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-amber-700">IP fuera del nodo seleccionado</p>
              <p className="text-[11px] text-amber-600 mt-0.5">
                <span className="font-mono">{device.ip}</span> no pertenece a <span className="font-mono">{node.segmento_lan}</span>.<br />
                Verifica que el nodo sea correcto antes de guardar.
              </p>
            </div>
          </div>
        )}

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

// ── Panel de estadísticas estilo airOS ───────────────────────────────────
function DeviceStatusPanel({ dev, onRefresh }: { dev: ScannedDevice; onRefresh?: (stats: AntennaStats) => void }) {
  const [stats, setStats] = useState<AntennaStats | undefined>(dev.cachedStats);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(dev.cachedStats ? Date.now() : null);
  const [showRaw, setShowRaw] = useState(false);

  // Refs para no reiniciar el intervalo en cada render
  const devRef = useRef(dev);
  devRef.current = dev;
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;
  const isFetchingRef = useRef(false);

  // Sincronizar si el padre actualiza cachedStats
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
    if (!d.sshUser || !d.sshPass || isFetchingRef.current) return;
    isFetchingRef.current = true;
    setRefreshing(true);
    try {
      const res = await fetchWithTimeout(`${API_BASE_URL}/api/device/antenna`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceIP: d.ip, deviceUser: d.sshUser, devicePass: d.sshPass, devicePort: d.sshPort ?? 22 }),
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

  // Auto-refresh cada 5 segundos mientras el panel está montado (visible)
  useEffect(() => {
    if (!dev.sshUser || !dev.sshPass) return;
    const id = setInterval(doFetch, 5000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dev.sshUser, dev.sshPass]);

  const handleRefresh = () => doFetch();

  // Barra de señal estilo airOS: -40 dBm = 100%, -90 dBm = 0%
  const signalPct = (sig: number) => Math.min(100, Math.max(0, Math.round((sig + 90) / 50 * 100)));
  const signalColor = (sig: number) => sig >= -65 ? '#22c55e' : sig >= -75 ? '#f59e0b' : '#ef4444';

  // Barra genérica de porcentaje
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
      {/* ── Cabecera ── */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-700 text-white">
        <div className="flex items-center gap-2">
          <div className="w-1 h-4 bg-sky-400 rounded-full" />
          <span className="text-xs font-bold tracking-wide uppercase">Estado · {dev.ip}</span>
          {dev.sshUser && (
            <span className="text-[10px] font-mono bg-white/10 px-1.5 py-0.5 rounded">{dev.sshUser}</span>
          )}
          {/* Badge En vivo con punto pulsante */}
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

      {/* ── Cuerpo: dos columnas en pantallas medianas, una en móvil ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-slate-100">

        {/* Columna izquierda — Info de configuración */}
        <div className="px-4 py-3">
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest pb-1.5 border-b border-slate-100 mb-2">Configuración</p>
          {([
            ['Modelo de Dispositivo', s.deviceModel || dev.model],
            ['Nombre de dispositivo', s.deviceName || dev.name],
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
            // AC-específicos
            ['Temperatura', s.temperature != null ? `${s.temperature} °C` : null],
            ['CINR', s.cinr != null ? `${s.cinr} dB` : null],
            ['Flujos TX/RX (NSS)', (s.txNss != null || s.rxNss != null) ? `${s.txNss ?? '—'} / ${s.rxNss ?? '—'}` : null],
            ['Índice MCS TX/RX', (s.txIdx != null || s.rxIdx != null) ? `${s.txIdx ?? '—'} / ${s.rxIdx ?? '—'}` : null],
            ['Airtime total', s.airtime != null ? `${s.airtime}%` : null],
            ['Capac. DL/UL polling', (s.dcap != null || s.ucap != null) ? `${s.dcap ?? '—'}% / ${s.ucap ?? '—'}%` : null],
            ['GPS Sync', s.gpsSync != null ? (s.gpsSync ? 'Sí' : 'No') : null],
            // M-series avanzado
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

        {/* Columna derecha — Métricas con barras */}
        <div className="px-4 py-3 space-y-3">
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest pb-1.5 border-b border-slate-100">Métricas en tiempo real</p>

          {/* CPU */}
          {s.cpuLoad != null && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] text-slate-500">CPU:</span>
                <span className={`text-[11px] font-bold font-mono ${s.cpuLoad < 50 ? 'text-sky-600' : s.cpuLoad < 80 ? 'text-amber-500' : 'text-rose-500'}`}>{s.cpuLoad} %</span>
              </div>
              <Bar value={s.cpuLoad} colorClass={s.cpuLoad < 50 ? 'bg-sky-400' : s.cpuLoad < 80 ? 'bg-amber-400' : 'bg-rose-500'} />
            </div>
          )}

          {/* Memoria */}
          {s.memoryPercent != null && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] text-slate-500">Memory:</span>
                <span className={`text-[11px] font-bold font-mono ${s.memoryPercent < 60 ? 'text-emerald-600' : s.memoryPercent < 80 ? 'text-amber-500' : 'text-rose-500'}`}>{s.memoryPercent} %</span>
              </div>
              <Bar value={s.memoryPercent} colorClass={s.memoryPercent < 60 ? 'bg-emerald-400' : s.memoryPercent < 80 ? 'bg-amber-400' : 'bg-rose-500'} />
            </div>
          )}

          {/* AP MAC */}
          {s.apMac && (
            <div className="flex items-center justify-between py-1 border-t border-slate-50">
              <span className="text-[11px] text-slate-500">AP MAC:</span>
              <span className="text-[11px] font-bold font-mono text-slate-700">{s.apMac}</span>
            </div>
          )}

          {/* Señal — barra estilo airOS */}
          {s.signal != null && (
            <div className="border-t border-slate-100 pt-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] text-slate-500">Intensidad de la señal:</span>
                <span className="text-[11px] font-bold font-mono" style={{ color: signalColor(s.signal) }}>{s.signal} dBm</span>
              </div>
              {/* Barra de colores degradada estilo airOS */}
              <div className="relative h-2.5 rounded-full overflow-hidden"
                style={{ background: 'linear-gradient(to right, #ef4444 0%, #f59e0b 40%, #22c55e 80%)' }}>
                <div className="absolute right-0 top-0 h-full bg-slate-100 rounded-r-full"
                  style={{ width: `${100 - signalPct(s.signal)}%` }} />
              </div>
            </div>
          )}

          {/* Noise / SNR / CCQ */}
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

          {/* AirMAX */}
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

          {/* Temperatura (AC) */}
          {s.temperature != null && (
            <div className="border-t border-slate-100 pt-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] text-slate-500">Temperatura:</span>
                <span className={`text-[11px] font-bold font-mono ${s.temperature < 60 ? 'text-emerald-600' : s.temperature < 80 ? 'text-amber-500' : 'text-rose-500'}`}>{s.temperature} °C</span>
              </div>
              <Bar value={Math.round((s.temperature / 100) * 100)} colorClass={s.temperature < 60 ? 'bg-emerald-400' : s.temperature < 80 ? 'bg-amber-400' : 'bg-rose-500'} />
            </div>
          )}

          {/* CINR (AC) */}
          {s.cinr != null && (
            <div className="flex justify-between border-t border-slate-100 pt-2">
              <span className="text-[11px] text-slate-500">CINR:</span>
              <span className={`text-[11px] font-mono font-bold ${s.cinr >= 20 ? 'text-emerald-600' : s.cinr >= 10 ? 'text-sky-600' : 'text-amber-500'}`}>{s.cinr} dB</span>
            </div>
          )}

          {/* Airtime (AC) */}
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

      {/* ── Estaciones del AP ── */}
      {s.stations && s.stations.length > 0 && (
        <div className="px-4 py-3 border-t border-slate-100">
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">
            Estaciones conectadas ({s.stations.length})
          </p>
          <div className="space-y-1">
            {s.stations.map((sta, i) => (
              <div key={i} className="flex items-center gap-4 px-3 py-1.5 bg-slate-50 rounded-lg border border-slate-100 text-[11px]">
                <span className="font-mono font-semibold text-slate-700 w-36 shrink-0">{sta.mac}</span>
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
            ))}
          </div>
        </div>
      )}

      {/* ── Raw JSON ── */}
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

// cachedStats se guarda COMPLETO en IndexedDB (statsCache) via deviceDb.saveSingle()
// No se realiza ningún filtrado — todo el JSON de mca-status se persiste para diagnóstico IA.

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

// ── M5 Detail Modal helpers ────────────────────────────────────────────────
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

// Detecta familia del dispositivo: AC (airOS v8+) vs M5 (airOS v6)
function detectFamily(dev: ScannedDevice): 'ac' | 'm5' | 'unknown' {
  const model = (dev.cachedStats?.deviceModel ?? dev.model ?? '').toUpperCase();
  const fw    = (dev.cachedStats?.fwPrefix ?? '').toUpperCase();
  if (/\bAC\b|5AC|AC\d|ACGEN/.test(model) || fw === 'XC') return 'ac';
  if (/M[235679]\b|M900/.test(model) || fw === 'XW' || fw === 'XM') return 'm5';
  return 'unknown';
}

// Bloque de interfaz compartido M5 y AC
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

function M5FullInfoModal({ dev, onClose }: { dev: ScannedDevice; onClose: () => void }) {
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
              Sin datos disponibles — escanea la red para obtener información del dispositivo.
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
  const [m5DetailDevice, setM5DetailDevice] = useState<ScannedDevice | null>(null);

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

  // ── Resize de columnas ──────────────────────────────────────────────────
  const [colWidths, setColWidths] = useState<Record<string, number>>({});
  const resizingRef = useRef<{ key: string; startX: number; startW: number } | null>(null);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const r = resizingRef.current;
      if (!r) return;
      const delta = e.clientX - r.startX;
      setColWidths(prev => ({ ...prev, [r.key]: Math.max(50, r.startW + delta) }));
    };
    const onUp = () => { resizingRef.current = null; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, []);

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

  // Cuando la lista de nodos cambia (ej: se eliminó un nodo), recargar devices desde DB
  // para reflejar la limpieza de orphans sin necesidad de F5
  const nodesLengthRef = useRef(nodes.length);
  useEffect(() => {
    const prev = nodesLengthRef.current;
    nodesLengthRef.current = nodes.length;
    // Solo actuar cuando hay una reducción (eliminación de nodo), no en la carga inicial
    if (prev > nodes.length) {
      deviceDb.load().then(devices => {
        setSavedDevices(devices);
        setSavedIds(new Set(devices.map(d => d.id)));
      });
    }
  }, [nodes.length]);

  const loadNodes = useCallback(async () => {
    if (!credentials) return;
    try {
      const res = await fetchWithTimeout(`${API_BASE_URL}/api/nodes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
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

  // Limpiar resultados de escaneo al cambiar de nodo (previene guardar equipos en nodo equivocado)
  const prevSelectedNodeIdRef = useRef<string | null>(null);
  useEffect(() => {
    const newId = selectedNode?.id ?? null;
    if (prevSelectedNodeIdRef.current !== null && newId !== prevSelectedNodeIdRef.current) {
      setScanResults([]);
      setAllScannedIPs([]);
      setSshStatus({});
      setScannedCount(0);
      setScanState({ phase: 'idle', current: 0, total: 0 });
      try { sessionStorage.removeItem(SESSION_SCAN_KEY); } catch { /* */ }
    }
    prevSelectedNodeIdRef.current = newId;
  }, [selectedNode]);

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
                  role: (s.mode === 'ap' || s.mode === 'master') ? 'ap' : s.mode === 'sta' ? 'sta' : next[idx].role,
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
      const res = await apiFetch(`${API_BASE_URL}/api/node/scan-stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodeLan: effectiveLan }),
      });
      if (!res.ok || !res.body) throw new Error('Error en el inicio del escaneo asíncrono');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let discoveredDevices: ScannedDevice[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || ''; 
        
        for (const block of lines) {
           const linesSplit = block.split('\n');
           const eventLine = linesSplit.find(l => l.startsWith('event:'));
           const dataLine = linesSplit.find(l => l.startsWith('data:'));
           if (!eventLine || !dataLine) continue;
           
           const eventName = eventLine.replace('event:', '').trim();
           const dataCode = dataLine.replace('data:', '').trim();
           if (!dataCode) continue;
           const data = JSON.parse(dataCode);
           
           if (eventName === 'progress') {
              setScannedCount(data.scanned);
              if (data.found && data.found.length > 0) {
                 setScanResults(prev => {
                   const map = new Map(prev.map(d => [d.ip, d]));
                   data.found.forEach((d: ScannedDevice) => map.set(d.ip, d));
                   return Array.from(map.values());
                 });
              }
           } else if (eventName === 'complete') {
              discoveredDevices = data.devices || discoveredDevices;
              setScanResults(discoveredDevices);
              setAllScannedIPs(discoveredDevices.map((d: ScannedDevice) => d.ip));
              setScannedCount(data.total);
              setDebugMsg(`Escaneadas ${data.total} IPs — ${discoveredDevices.length} encontrados`);
           } else if (eventName === 'error') {
              throw new Error(data.message);
           }
        }
      }

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
            apMac: s.apMac ?? merged.apMac, cachedStats: s,
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
                role: (s.mode === 'ap' || s.mode === 'master') ? 'ap' : s.mode === 'sta' ? 'sta' : next[idx].role,
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

  void savedDevices.reduce<Record<string, { nodeName: string; devices: SavedDevice[] }>>((acc, d) => {
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
    ...activeConfigCols.map(c => colWidths[c.key] != null ? `${colWidths[c.key]}px` : c.width),
    '32px',   // Expand toggle
    '180px',  // Acciones (ampliado para nuevo botón Estado)
  ].join(' ');

  // ── Guardar directamente (sin modal) cuando SSH ya validó credenciales ──
  const handleDirectSave = async (dev: ScannedDevice, node: NodeInfo) => {
    // Si la IP no pertenece a la subred del nodo, abrir modal para que el usuario vea la advertencia
    if (node.segmento_lan && !ipInCidr(dev.ip, node.segmento_lan)) {
      setAddingDevice(dev);
      return;
    }
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
      cachedStats: s,
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
                      className="px-3 py-3 min-w-0 overflow-hidden select-none flex items-center gap-1 hover:text-slate-700 relative group"
                    >
                      <span className="cursor-pointer flex items-center gap-1 flex-1 min-w-0 truncate" onClick={() => toggleSort(col.key)}>
                        {col.label}
                        {sortConfig?.key === col.key && <span className="text-indigo-600">{sortConfig.dir === 'asc' ? '↑' : '↓'}</span>}
                      </span>
                      <span
                        title="Arrastra para redimensionar"
                        className="cursor-col-resize opacity-0 group-hover:opacity-60 hover:!opacity-100 text-slate-400 shrink-0 select-none"
                        onMouseDown={e => {
                          e.preventDefault();
                          const currentW = colWidths[col.key] ?? (parseInt(col.width) || 80);
                          resizingRef.current = { key: col.key, startX: e.clientX, startW: currentW };
                        }}
                      >
                        <GripVertical className="w-3 h-3" />
                      </span>
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
                          {/* Botón Estado M5 — completo, modelo específico */}
                          {hasStats && (
                            <button
                              onClick={() => setM5DetailDevice(dev)}
                              title="Ver estado completo del dispositivo (airOS)"
                              className="flex items-center space-x-1 px-2 py-1.5 rounded-lg text-[11px] font-bold bg-violet-50 text-violet-600 hover:bg-violet-100 border border-violet-200 transition-all"
                            >
                              <Activity className="w-2.5 h-2.5" />
                              <span>Estado</span>
                            </button>
                          )}
                          {/* Botón de datos SSH raw */}
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
                      {isExpanded && (
                        <DeviceStatusPanel
                          dev={dev}
                          onRefresh={(freshStats) => {
                            setScanResults(prev => prev.map(r =>
                              r.ip === dev.ip ? { ...r, cachedStats: freshStats } : r
                            ));
                          }}
                        />
                      )}
                    </Fragment>
                  );
                })}
              </div>{/* fin minWidth wrapper */}
            </div>
          </div>
        )}
      </div>


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
            service: 'sstp' as const, disabled: false, running: false,
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

        {/* M5 Full Info Modal */}
        {m5DetailDevice && (
          <M5FullInfoModal dev={m5DetailDevice} onClose={() => setM5DetailDevice(null)} />
        )}
    </div>
  );
}
