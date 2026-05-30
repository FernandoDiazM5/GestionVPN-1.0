export const MONITOR_LABELS = {
  TITLE: 'Monitor de APs',
  SUBTITLE: 'Monitoreo en tiempo real — APs de la pestaña Equipos, agrupados por nodo',
  NODES_COUNT: 'nodos',
  APS_COUNT: 'APs',
  CPES_LIVE: 'CPEs live',
  NO_TUNNEL: 'Sin túnel VPN activo',
  NO_TUNNEL_DESC: 'Conéctate a un nodo para ver sus APs en tiempo real',
  NO_APS: 'Sin APs guardados',
  NO_APS_DESC: 'Ve a la pestaña Escanear, agrega dispositivos con rol "AP" y vuelve aquí para monitorearlos.',
  SEARCH_PLACEHOLDER: 'Buscar AP…',
  RELOAD_TITLE: 'Recargar lista de equipos',
};

export const FILTER_OPTIONS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  ALL: 'all',
} as const;

export const FILTER_LABELS = {
  active: 'Activos',
  inactive: 'Inactivos',
  all: 'Todos',
} as const;

export const POLL_INTERVALS = [
  { value: 0, label: 'Auto-poll Off' },
  { value: 15000, label: '15s' },
  { value: 30000, label: '30s' },
  { value: 60000, label: '1m' },
  { value: 120000, label: '2m' },
  { value: 300000, label: '5m' },
] as const;

export const STATUS_INDICATORS = {
  ONLINE: { label: 'Online', color: 'bg-emerald-500' },
  PARTIAL: { label: 'Parcial / Errores', color: 'bg-amber-400' },
  CONNECTING: { label: 'Conectando…', color: 'bg-sky-400' },
  NO_DATA: { label: 'Sin datos', color: 'bg-slate-300' },
} as const;

export const STORAGE_KEYS = {
  EXPANDED_APS: 'apMonitorExpandedAps',
  POLL_INTERVAL: 'vpn_ap_poll_ms',
} as const;

export const POLLING_CONFIG = {
  INITIAL_DELAY: 600,
  MIN_FRESHNESS: 300_000,
  AUTO_POLL_TIMEOUT: 5000,
} as const;
