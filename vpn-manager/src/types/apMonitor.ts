/** Nodo de monitoreo de APs (independiente de los nodos MikroTik VPN) */
export interface ApNode {
  id: string;
  nombre: string;
  descripcion?: string;
  ubicacion?: string;
  created_at: number;
  ap_count?: number;
}

/** AP registrado en un nodo */
export interface RegisteredAp {
  id: string;
  ap_group_id: number;
  hostname?: string;
  modelo?: string;
  firmware?: string;
  mac_lan?: string;
  mac_wlan?: string;
  ip: string;
  frecuencia_mhz?: number;
  ssid?: string;
  canal_mhz?: number;
  tx_power?: number;
  modo_red?: string;
  usuario_ssh?: string;
  puerto_ssh?: number;
  is_active?: number;
  created_at?: number;
  // clave_ssh_enc is NEVER sent to the frontend (encrypted server-side)
}

/** CPE en tiempo real — datos de wstalist/sta.cgi (no se guardan en DB como live) */
export interface LiveCpe {
  mac: string;

  // ── AP side (lo que ve el AP del CPE) ─────────────────────────────────
  signal?: number | null;           // dBm — señal AP side
  rssi?: number | null;             // RSSI AP side (puede diferir de signal)
  noisefloor?: number | null;       // Noise Floor dBm
  ccq?: number | null;              // 0-100 %
  tx_rate?: number | null;          // Mbps — tasa downlink (AP→CPE)
  rx_rate?: number | null;          // Mbps — tasa uplink (CPE→AP)
  tx_power?: number | null;         // dBm — potencia TX del AP hacia el CPE
  tx_latency?: number | null;       // ms — latencia TX AP side
  distance?: number | null;         // metros — distancia AP side
  uptime?: number | null;           // segundos
  uptimeStr?: string | null;
  lastip?: string | null;
  tx_bytes?: number | null;
  rx_bytes?: number | null;
  throughputRxKbps?: number | null;
  throughputTxKbps?: number | null;

  // ── Remote / CPE side (wstalist remote.*) ─────────────────────────────
  remote_signal?: number | null;        // dBm — señal desde el CPE
  remote_noisefloor?: number | null;    // dBm
  remote_tx_power?: number | null;      // dBm
  remote_cpuload?: number | null;       // %
  remote_hostname?: string | null;      // hostname del CPE remoto
  remote_distance?: number | null;      // metros (M5)
  remote_tx_latency?: number | null;    // ms (M5)

  // ── AirMax M5 (airmax.quality/capacity/signal) ─────────────────────────
  airmax_quality?: number | null;       // %
  airmax_capacity?: number | null;      // %
  airmax_signal?: number | null;        // dBm

  // ── AirMax AC (airmax.downlink_capacity, uplink_capacity, cinr) ────────
  airmax_dcap?: number | null;          // Mbps downlink capacity
  airmax_ucap?: number | null;          // Mbps uplink capacity
  airmax_cinr_rx?: number | null;       // dB CINR RX
  airmax_cinr_tx?: number | null;       // dB CINR TX
  airmax_rx_usage?: number | null;      // % airtime RX
  airmax_tx_usage?: number | null;      // % airtime TX

  // ── Identificación del firmware ────────────────────────────────────────
  firmware_family?: string | null;      // 'AC' | 'M5'

  // ── Identidad del CPE desde wstalist ──────────────────────────────────
  cpe_name?: string | null;
  cpe_product?: string | null;

  // ── Enriquecido desde cpes DB ─────────────────────────────────────────
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
  last_seen?: number;
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
  cpe_id: number;
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
