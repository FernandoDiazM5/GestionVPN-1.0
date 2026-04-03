/** Dispositivo Ubiquiti descubierto via ARP + HTTP /status.cgi (sin credenciales) */
export interface ScannedDevice {
  ip: string;
  mac: string;
  name: string;
  model: string;
  firmware: string;
  role: 'ap' | 'sta' | 'unknown';
  parentAp?: string;
  essid?: string;
  frequency?: number;
  // Nuevos campos para Auto-Login en el escáner
  sshUser?: string;
  sshPass?: string;
  sshPort?: number;
  cachedStats?: AntennaStats;
}

/** Dispositivo guardado persistentemente en IndexedDB */
export interface SavedDevice {
  id: string;   // MAC sin separadores (AA:BB → AABB)
  mac: string;
  ip: string;
  name: string;
  model: string;
  firmware: string;
  role: 'ap' | 'sta' | 'unknown';
  parentAp?: string;
  essid?: string;
  frequency?: number;
  nodeId: string;
  nodeName: string;
  // SSH al dispositivo Ubiquiti (para mca-status)
  sshUser?: string;
  sshPass?: string;
  hasSshPass?: boolean;
  sshPort?: number;
  // Router detrás de la antena (WebUI)
  routerIp?: string;
  routerUser?: string;
  routerPass?: string;
  routerPort?: number;
  // Info estática cacheada desde mca-status (se actualiza al leer stats)
  deviceName?: string;   // hostname del dispositivo airOS
  lanMac?: string;   // MAC de la interfaz LAN (eth0)
  security?: string;   // tipo de seguridad WiFi (wpa2aes, etc.)
  channelWidth?: number;   // ancho de canal MHz
  networkMode?: string;   // netrole: "router" | "bridge"
  chains?: string;   // cadenas TX/RX: "1X1", "2X2"
  apMac?: string;   // MAC del AP al que conecta (modo STA)
  activo?: number | boolean;
  addedAt: number;
  lastSeen?: number;
  lastCpeCount?: number;      // cantidad de CPEs en la última sincronización manual
  lastCpeCountAt?: number;    // timestamp de esa sincronización
  // Stats completas cacheadas desde la última lectura SSH
  cachedStats?: AntennaStats;
}

/** Estadísticas RF devueltas por mca-status (Ubiquiti AirOS) */
export interface AntennaStats {
  // ── Variable — solo se muestra, NO se guarda historial ──────────────
  signal?: number;   // dBm
  noiseFloor?: number;   // dBm
  ccq?: number;   // 0-100 %
  txRate?: number;   // Mbps
  rxRate?: number;   // Mbps
  cpuLoad?: number;   // 0-100 %
  memoryPercent?: number;   // 0-100 %
  airmaxQuality?: number;   // %
  airmaxCapacity?: number;   // %
  uptimeStr?: string;   // "15d 03:35:19"
  deviceDate?: string;   // fecha del dispositivo
  stations?: Array<{
    mac: string;
    signal?: number | null;
    noiseFloor?: number | null;
    ccq?: number | null;
    txRate?: number | null;
    rxRate?: number | null;
    distance?: number | null;
    uptime?: number | null;
    txLatency?: number | null;    // ms — latencia TX reportada por la estación
    txPower?: number | null;      // dBm — potencia TX de la estación remota
    hostname?: string | null;     // nombre del equipo remoto
    remoteModel?: string | null;  // modelo del equipo remoto (wstalist remote.platform)
    lastIp?: string | null;       // última IP asignada (wstalist lastip)
    airmaxQuality?: number | null;   // calidad airMAX de esta estación (0–100 %)
    airmaxCapacity?: number | null;  // capacidad airMAX de esta estación (0–100 %)
  }>;

  // ── Estático — se guarda en SavedDevice al cargar ───────────────────
  deviceName?: string;   // hostname airOS
  deviceModel?: string;   // modelo (LiteBeam M5, etc.)
  firmwareVersion?: string; // versión firmware (v6.1.7 XW)
  wlanMac?: string;   // MAC WLAN
  lanMac?: string;   // MAC LAN (eth0)
  apMac?: string;   // MAC del AP remoto (modo STA)
  essid?: string;   // SSID
  security?: string;   // wpa2aes, etc.
  mode?: string;   // sta / ap
  networkMode?: string;   // router / bridge
  frequency?: number;   // MHz
  channelNumber?: number;   // número de canal
  channelWidth?: number;   // MHz
  txPower?: number;   // dBm
  distance?: number;   // metros
  chains?: string;   // "1X1"
  airmaxEnabled?: boolean;
  airmaxPriority?: string;
  channelWidthExt?: string;  // "Inferior" | "Superior" (extensión HT40-/HT40+)
  freqRange?: string;  // "5320 - 5360 MHz" (rango de la banda)
  antenna?: string;  // "Feed only - 3 dBi"
  lanSpeed?: number;  // Mbps
  lanInfo?: string;  // "100Mbps-Completo"

  // ── Campos M5-específicos (mca-status airOS M-series) ──────────────────
  rssi?: number;              // RSSI raw (puede diferir de signal)
  txRetries?: number;         // Reintentos de TX (wireless.stats.tx_retries)
  missedBeacons?: number;     // Balizas perdidas
  rxCrypts?: number;          // Errores de encriptación RX
  chainRssi?: number[];       // RSSI por cadena de antena
  airsyncMode?: string;       // wireless.airsync_mode
  atpcStatus?: string;        // Control automático potencia TX
  opmode?: string;            // ej: "11NAHT20"
  countryCode?: string;       // Código de país
  fwPrefix?: string;          // Familia del firmware (host.fwprefix)
  ifaceDetails?: Array<{      // Interfaces físicas y lógicas
    ifname: string;
    hwaddr: string;
    mtu?: number | null;
    ipaddr?: string | null;
    enabled?: boolean | null;
    plugged?: boolean | null;
    speed?: number | null;
    duplex?: boolean | null;
    dhcpc?: boolean | null;
    dhcpd?: boolean | null;
    pppoe?: boolean | null;
    // AC-específicos
    snr?: number | null;
    cableLen?: number | null;
    txBytesIfc?: number | null;
    rxBytesIfc?: number | null;
    txErrors?: number | null;
    rxErrors?: number | null;
  }>;

  // ── Campos AC-específicos (airOS AC v8.x — LiteBeam 5AC, etc.) ─────────
  temperature?: number;       // Temperatura de operación °C
  deviceHeight?: number;      // Altura física configurada
  loadAvg?: string;           // Promedio de carga (loadavg)
  hideSsid?: boolean;         // SSID oculto
  antennaGain?: number;       // Ganancia de antena dBi
  centerFreq1?: number;       // Frecuencia central MHz
  txIdx?: number;             // Índice modulación TX
  rxIdx?: number;             // Índice modulación RX
  txNss?: number;             // Flujos espaciales TX
  rxNss?: number;             // Flujos espaciales RX
  txChainmask?: number;       // Máscara cadenas TX
  rxChainmask?: number;       // Máscara cadenas RX
  chainNames?: string[];      // Nombres de cadenas (Chain 0, Chain 1…)
  cinr?: number;              // CINR dB
  evm?: string;               // EVM matrix
  gpsSync?: boolean;          // Sincronización GPS
  fixedFrame?: boolean;       // Tramas fijas
  dcap?: number;              // Download capacity polling %
  ucap?: number;              // Upload capacity polling %
  airtime?: number;           // Uso tiempo aire total %
  txAirtime?: number;         // TX airtime %
  rxAirtime?: number;         // RX airtime %
  txLatency?: number;         // Latencia TX ms

  // ── Campos CPE extraídos de wstalist/sta.cgi (vista topología) ───────────
  // Señal desde el lado remoto (CPE reportando al AP)
  remoteSig?: number | null;
  remoteNoiseFloor?: number | null;
  remoteTxPower?: number | null;
  remoteCpuLoad?: number | null;
  remoteHostname?: string | null;
  remoteModel?: string | null;
  remoteVersion?: string | null;
  remoteNetrole?: string | null;
  remoteDistance?: number | null;   // distancia desde el CPE (M5)
  remoteTxLatency?: number | null;  // latencia TX desde el CPE (M5)
  // AirMax M5 (wstalist airmax.signal)
  airmaxSignal?: number | null;     // AirMax RF signal dBm (M5)
  // AirMax AC (valores del wstalist AC-series)
  airmaxDcap?: number | null;       // downlink capacity Mbps
  airmaxUcap?: number | null;       // uplink capacity Mbps
  airmaxCinrRx?: number | null;     // CINR RX dB
  airmaxCinrTx?: number | null;     // CINR TX dB
  // Throughput calculado (delta bytes entre polls)
  throughputRxKbps?: number | null;
  throughputTxKbps?: number | null;
  txBytes?: number | null;
  rxBytes?: number | null;
  // Misc
  firmwareFamily?: string | null;   // 'AC' | 'M5'
  uptime?: number | null;           // uptime en segundos
  lastIp?: string | null;           // última IP asignada (wstalist lastip)

  // ── Tráfico TX/RX por interfaz (/proc/net/dev) ──────────────────────────
  ifaceTraffic?: Record<string, {
    rxBytes: number; rxPackets: number;
    txBytes: number; txPackets: number;
  }>;

  // ── Memoria detallada (/proc/meminfo) ────────────────────────────────────
  memTotalKb?:   number;
  memFreeKb?:    number;
  memBuffersKb?: number;
  memCachedKb?:  number;

  raw?: string; // fallback si no es JSON ni key=value válido
  _rawJson?: string;     // JSON crudo de mca-status
  // Secciones raw — solo sesión, NO se persisten en DB
  _rawUname?:    string;
  _rawRoutes?:   string;
  _rawIwconfig?: string;
  _rawWstalist?: string;
  _rawMcaCli?:   string;
  _rawNetDev?:   string;
  _rawMeminfo?:  string;
  _rawBoard?:    string;
}

/** Interfaz wireless devuelta por /api/device/wifi/get */
export interface WifiInterface {
  id: string;
  name: string;
  ssid: string;
  mode: string;
  band?: string;
  frequency?: string;
  securityProfile: string;
  disabled: boolean;
}

/** Perfil de seguridad wireless */
export interface WifiSecurityProfile {
  id: string;
  name: string;
  wpa2Key: string;
  mode: string;
}
