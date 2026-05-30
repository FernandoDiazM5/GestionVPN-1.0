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

export { ColDef, ApColDef, CPE_COL_DEFS, DEFAULT_HIDDEN, LS_KEY, loadColPrefs, saveColPrefs, AP_COL_DEFS, AP_DEFAULT_HIDDEN, AP_LS_KEY, loadApColPrefs, saveApColPrefs };
