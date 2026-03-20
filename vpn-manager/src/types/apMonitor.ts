/** Nodo de monitoreo de APs (independiente de los nodos MikroTik VPN) */
export interface ApNode {
  id: string;
  nombre: string;
  descripcion?: string;
  ubicacion?: string;
  creado_en: number;
  ap_count?: number;
}

/** AP registrado en un nodo */
export interface RegisteredAp {
  id: string;
  nodo_id: string;
  hostname?: string;
  modelo?: string;
  firmware?: string;
  mac_lan?: string;
  mac_wlan?: string;
  ip: string;
  frecuencia_ghz?: number;
  ssid?: string;
  canal_mhz?: number;
  tx_power?: number;
  modo_red?: string;
  usuario_ssh?: string;
  puerto_ssh?: number;
  activo?: number;
  registrado_en?: number;
  // clave_ssh is NEVER sent to the frontend
}

/** CPE en tiempo real — datos de wstalist (no se guardan en DB como live) */
export interface LiveCpe {
  mac: string;
  signal?: number | null;        // dBm
  rssi?: number | null;          // Remote Signal dBm
  noisefloor?: number | null;    // Noise Floor dBm
  cinr?: number | null;          // dB
  ccq?: number | null;           // 0-100 %
  tx_rate?: number | null;       // kbps — Downlink Capacity
  rx_rate?: number | null;       // kbps — Uplink Capacity
  airtime_tx?: number | null;    // %
  airtime_rx?: number | null;    // %
  uptime?: number | null;        // seconds
  uptimeStr?: string | null;
  distance?: number | null;      // km
  lastip?: string | null;
  tx_bytes?: number | null;
  rx_bytes?: number | null;
  throughputRxKbps?: number | null;
  throughputTxKbps?: number | null;
  // Enriched from cpes_conocidos
  hostname?: string | null;
  modelo?: string | null;
  isKnown?: boolean;
}

/** Resultado de un poll de AP */
export interface PollResult {
  stations: LiveCpe[];
  polledAt: number;
  loading: boolean;
  error?: string;
}

/** CPE conocido — datos estáticos guardados en DB */
export interface KnownCpe {
  mac: string;
  ap_id?: string;
  hostname?: string;
  modelo?: string;
  firmware?: string;
  ip_lan?: string;
  mac_lan?: string;
  mac_wlan?: string;
  mac_ap?: string;
  modo_red?: string;
  frecuencia_mhz?: number;
  canal_mhz?: number;
  tx_power?: number;
  ssid_ap?: string;
  ultima_vez_visto?: number;
}

/** Detalle de un CPE obtenido por SSH */
export interface CpeDetail {
  deviceName?: string;
  deviceModel?: string;
  firmwareVersion?: string;
  signal?: number;
  noiseFloor?: number;
  ccq?: number;
  txRate?: number;
  rxRate?: number;
  txPower?: number;
  channelWidth?: number;
  frequency?: number;
  mode?: string;
  networkMode?: string;
  wlanMac?: string;
  lanMac?: string;
  apMac?: string;
  essid?: string;
  security?: string;
  uptimeStr?: string;
  ip?: string;
}

/** Snapshot histórico de señal */
export interface SignalSnapshot {
  id: number;
  cpe_mac: string;
  ap_id: string;
  timestamp: number;
  signal_dbm?: number;
  remote_signal_dbm?: number;
  noisefloor_dbm?: number;
  cinr_db?: number;
  ccq_pct?: number;
  distancia_km?: number;
  downlink_mbps?: number;
  uplink_mbps?: number;
  airtime_tx?: number;
  airtime_rx?: number;
}
