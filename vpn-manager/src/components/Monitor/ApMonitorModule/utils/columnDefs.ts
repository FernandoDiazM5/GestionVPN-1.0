interface ColDef { key: string; label: string; always?: boolean; width: string; right?: boolean; }

const CPE_AVAILABILITY_METRICS = {
  ccq: 'ccq',
  am_qual: 'airmax_quality',
  am_cap: 'airmax_capacity',
  am_dcap: 'airmax_dcap',
  am_ucap: 'airmax_ucap',
} as const;

type CpeMetricSource = Partial<Record<(typeof CPE_AVAILABILITY_METRICS)[keyof typeof CPE_AVAILABILITY_METRICS], unknown>>;

function getUnavailableCpeMetricColumns(stations: CpeMetricSource[]): Set<string> {
  if (stations.length === 0) return new Set();

  return new Set(
    Object.entries(CPE_AVAILABILITY_METRICS)
      .filter(([, field]) => stations.every(station => {
        const value = station[field];
        return value == null || value === '' || (typeof value === 'number' && !Number.isFinite(value));
      }))
      .map(([column]) => column),
  );
}

const CPE_COL_DEFS: ColDef[] = [
  { key: 'status', label: 'Estado', always: true, width: '64px' },
  { key: 'mac', label: 'MAC / Host', always: true, width: '180px' },
  { key: 'modelo', label: 'Modelo', width: '130px' },
  { key: 'nombre', label: 'Nombre Disp.', width: '180px' },
  { key: 'signal', label: 'Señal AP', width: '84px', right: true },
  { key: 'rssi', label: 'Señal CPE', width: '88px', right: true },
  { key: 'noise', label: 'Noise', width: '76px', right: true },
  { key: 'cinr', label: 'CINR', width: '68px', right: true },
  { key: 'ccq', label: 'CCQ', width: '68px', right: true },
  { key: 'tx_rate', label: '↓ TX Rate', width: '92px', right: true },
  { key: 'rx_rate', label: '↑ RX Rate', width: '92px', right: true },
  { key: 'am_qual', label: 'AM Qual', width: '76px', right: true },
  { key: 'am_cap', label: 'AM Cap', width: '76px', right: true },
  { key: 'am_dcap', label: 'DL Cap', width: '76px', right: true },
  { key: 'am_ucap', label: 'UL Cap', width: '76px', right: true },
  { key: 'air_tx', label: 'Air TX %', width: '72px', right: true },
  { key: 'air_rx', label: 'Air RX %', width: '72px', right: true },
  { key: 'thr_rx', label: 'Thr ↓', width: '84px', right: true },
  { key: 'thr_tx', label: 'Thr ↑', width: '84px', right: true },
  { key: 'uptime', label: 'Uptime', width: '110px' },
  { key: 'distance', label: 'Dist (m)', width: '76px', right: true },
  { key: 'actions', label: 'Acciones', always: true, width: '80px' },
];
const DEFAULT_HIDDEN = new Set<string>(['noise', 'cinr', 'am_qual', 'am_cap', 'am_dcap', 'am_ucap', 'air_tx', 'air_rx', 'thr_rx', 'thr_tx']);

const LS_KEY = 'ap_monitor_cpe_cols';

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

interface ApColDef { key: string; label: string; always?: boolean; width: string; right?: boolean; }
const AP_COL_DEFS: ApColDef[] = [
  // El ancho incluye el texto completo y el icono de orden. Si una columna no
  // cabe, la tabla hace scroll horizontal en lugar de recortar el encabezado.
  { key: 'modo', label: 'Tipo', always: true, width: '82px' },
  { key: 'nombre', label: 'Antena', always: true, width: 'minmax(140px,1fr)' },
  { key: 'modelo', label: 'Modelo', width: '140px' },
  { key: 'ssid', label: 'SSID / Canal', width: '150px' },
  { key: 'signal', label: 'Señal', width: '82px', right: true },
  { key: 'ccq', label: 'CCQ', width: '70px', right: true },
  { key: 'txpwr', label: 'Potencia', width: '92px', right: true },
  { key: 'uptime', label: 'Tiempo en línea', width: '130px' },
  { key: 'cpu', label: 'CPU', width: '66px', right: true },
  { key: 'cpes', label: 'Clientes', always: true, width: '94px' },
  { key: 'estado', label: 'Estado', always: true, width: '86px' },
  { key: 'actions', label: 'Opciones', always: true, width: '190px' },
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

export type { ColDef, ApColDef };
export {
  CPE_AVAILABILITY_METRICS,
  CPE_COL_DEFS,
  DEFAULT_HIDDEN,
  LS_KEY,
  getUnavailableCpeMetricColumns,
  loadColPrefs,
  saveColPrefs,
  AP_COL_DEFS,
  AP_DEFAULT_HIDDEN,
  AP_LS_KEY,
  loadApColPrefs,
  saveApColPrefs,
};
