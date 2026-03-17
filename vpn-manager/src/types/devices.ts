/** Dispositivo Ubiquiti descubierto via ARP + HTTP /status.cgi (sin credenciales) */
export interface ScannedDevice {
  ip:        string;
  mac:       string;
  name:      string;
  model:     string;
  firmware:  string;
  role:      'ap' | 'sta' | 'unknown';
  parentAp?: string;
  essid?:    string;
  frequency?: number;
}

/** Dispositivo guardado persistentemente en IndexedDB */
export interface SavedDevice {
  id:        string;   // MAC sin separadores (AA:BB → AABB)
  mac:       string;
  ip:        string;
  name:      string;
  model:     string;
  firmware:  string;
  role:      'ap' | 'sta' | 'unknown';
  parentAp?: string;
  essid?:    string;
  frequency?: number;
  nodeId:    string;
  nodeName:  string;
  // SSH al dispositivo Ubiquiti (para mca-status)
  sshUser?:  string;
  sshPass?:  string;
  sshPort?:  number;
  // Router detrás de la antena (WebUI)
  routerIp?:   string;
  routerUser?: string;
  routerPass?: string;
  routerPort?: number;
  // Info estática cacheada desde mca-status (se actualiza al leer stats)
  deviceName?:   string;   // hostname del dispositivo airOS
  lanMac?:       string;   // MAC de la interfaz LAN (eth0)
  security?:     string;   // tipo de seguridad WiFi (wpa2aes, etc.)
  channelWidth?: number;   // ancho de canal MHz
  networkMode?:  string;   // netrole: "router" | "bridge"
  chains?:       string;   // cadenas TX/RX: "1X1", "2X2"
  apMac?:        string;   // MAC del AP al que conecta (modo STA)
  addedAt:   number;
  lastSeen?: number;
  // Stats completas cacheadas desde la última lectura SSH
  cachedStats?: AntennaStats;
}

/** Estadísticas RF devueltas por mca-status (Ubiquiti AirOS) */
export interface AntennaStats {
  // ── Variable — solo se muestra, NO se guarda historial ──────────────
  signal?:         number;   // dBm
  noiseFloor?:     number;   // dBm
  ccq?:            number;   // 0-100 %
  txRate?:         number;   // Mbps
  rxRate?:         number;   // Mbps
  cpuLoad?:        number;   // 0-100 %
  memoryPercent?:  number;   // 0-100 %
  airmaxQuality?:  number;   // %
  airmaxCapacity?: number;   // %
  uptimeStr?:      string;   // "15d 03:35:19"
  deviceDate?:     string;   // fecha del dispositivo
  stations?: Array<{
    mac:         string;
    signal?:     number;
    noiseFloor?: number;
    ccq?:        number;
    txRate?:     number;
    rxRate?:     number;
    distance?:   number;
    uptime?:     number;
  }>;

  // ── Estático — se guarda en SavedDevice al cargar ───────────────────
  deviceName?:    string;   // hostname airOS
  deviceModel?:   string;   // modelo (LiteBeam M5, etc.)
  firmwareVersion?: string; // versión firmware (v6.1.7 XW)
  wlanMac?:       string;   // MAC WLAN
  lanMac?:        string;   // MAC LAN (eth0)
  apMac?:         string;   // MAC del AP remoto (modo STA)
  essid?:         string;   // SSID
  security?:      string;   // wpa2aes, etc.
  mode?:          string;   // sta / ap
  networkMode?:   string;   // router / bridge
  frequency?:     number;   // MHz
  channelNumber?: number;   // número de canal
  channelWidth?:  number;   // MHz
  txPower?:       number;   // dBm
  distance?:      number;   // metros
  chains?:        string;   // "1X1"
  airmaxEnabled?: boolean;
  airmaxPriority?: string;
  channelWidthExt?: string;  // "Inferior" | "Superior" (extensión HT40-/HT40+)
  freqRange?:       string;  // "5320 - 5360 MHz" (rango de la banda)
  antenna?:         string;  // "Feed only - 3 dBi"
  lanSpeed?:        number;  // Mbps
  lanInfo?:         string;  // "100Mbps-Completo"

  raw?: string; // fallback si no es JSON ni key=value válido
}

/** Interfaz wireless devuelta por /api/device/wifi/get */
export interface WifiInterface {
  id:              string;
  name:            string;
  ssid:            string;
  mode:            string;
  band?:           string;
  frequency?:      string;
  securityProfile: string;
  disabled:        boolean;
}

/** Perfil de seguridad wireless */
export interface WifiSecurityProfile {
  id:      string;
  name:    string;
  wpa2Key: string;
  mode:    string;
}
