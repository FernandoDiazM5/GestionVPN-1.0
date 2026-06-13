import type { ColumnDef } from '../types';

export const COLUMN_DEFS: ColumnDef[] = [
  {
    key: 'essid',
    label: 'SSID / AP',
    width: 'minmax(120px, 1fr)',
    defaultVisible: true,
    requiresStats: false,
    render: (dev) => {
      const ssid = dev.cachedStats?.essid ?? dev.essid;
      const parentAp = dev.parentAp;
      if (!ssid && !parentAp) return <span className="text-2xs text-slate-300">—</span>;
      return (
        <div className="min-w-0">
          {ssid && (
            <span className="font-mono text-2xs text-slate-600 truncate block" title={ssid}>{ssid}</span>
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
      if (v == null) return <span className="text-2xs text-slate-300">—</span>;
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
      if (v == null) return <span className="text-2xs text-slate-300">—</span>;
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
      if (v == null) return <span className="text-2xs text-slate-300">—</span>;
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
      if (v == null) return <span className="text-2xs text-slate-300">—</span>;
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
      if (v == null) return <span className="text-2xs text-slate-300">—</span>;
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
      if (v == null) return <span className="text-2xs text-slate-300">—</span>;
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
      if (v == null) return <span className="text-2xs text-slate-300">—</span>;
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
      if (v == null) return <span className="text-2xs text-slate-300">—</span>;
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
      if (v == null) return <span className="text-2xs text-slate-300">—</span>;
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
      if (!v) return <span className="text-2xs text-slate-300">—</span>;
      return <span className="font-mono text-2xs text-slate-500">{v}</span>;
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
      if (v == null) return <span className="text-2xs text-slate-300">—</span>;
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
      if (v == null) return <span className="text-2xs text-slate-300">—</span>;
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
      if (v == null) return <span className="text-2xs text-slate-300">—</span>;
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
      if (v == null) return <span className="text-2xs text-slate-300">—</span>;
      const m = parseInt(String(v));
      return <span className="font-mono text-xs text-slate-500">{m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${m} m`}</span>;
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
      if (!v) return <span className="text-2xs text-slate-300">—</span>;
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
      if (!v) return <span className="text-2xs text-slate-300">—</span>;
      return <span className="font-mono text-2xs text-slate-600 truncate block" title={v}>{v}</span>;
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
      if (!v) return <span className="text-2xs text-slate-300">—</span>;
      return <span className="font-mono text-2xs text-slate-500 truncate block" title={v}>{v}</span>;
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
      if (!v) return <span className="text-2xs text-slate-300">—</span>;
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
      if (!v) return <span className="text-2xs text-slate-300">—</span>;
      return <span className="font-mono text-2xs text-slate-500 uppercase">{v}</span>;
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
      if (v == null) return <span className="text-2xs text-slate-300">—</span>;
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
      if (!v) return <span className="text-2xs text-slate-300">—</span>;
      return <span className="font-mono text-2xs text-slate-500">{v}</span>;
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
      if (!v) return <span className="text-2xs text-slate-300">—</span>;
      return <span className="font-mono text-2xs text-slate-500">{v}</span>;
    },
  },
  {
    key: 'routerLink',
    label: 'Acceso Router',
    width: '130px',
    defaultVisible: false,
    requiresStats: false,
    render: (dev) => {
      const port = dev.routerPort ?? 8075;
      const url = `http://${dev.ip}:${port}`;
      return (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 font-mono text-2xs text-sky-600 hover:text-sky-800 hover:underline truncate"
          title={`Abrir ${url}`}
        >
          {dev.ip}:{port}
        </a>
      );
    },
  },
];
