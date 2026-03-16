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
  // RouterOS API al router detrás de la antena (para WiFi)
  routerIp?: string;   // IP del router (por defecto = misma que la antena)
  routerUser?: string;
  routerPass?: string;
  routerPort?: number; // Puerto WebUI (ej: 8075)
  addedAt:   number;
  lastSeen?: number;
}

/** Estadísticas RF devueltas por mca-status (Ubiquiti AirOS) */
export interface AntennaStats {
  signal?:         number;   // dBm
  noiseFloor?:     number;   // dBm
  ccq?:            number;   // 0-100 %
  txRate?:         number;   // Mbps
  rxRate?:         number;   // Mbps
  frequency?:      number;   // MHz
  distance?:       number;   // metros
  txPower?:        number;   // dBm
  uptime?:         number;   // segundos
  essid?:          string;
  mode?:           string;
  airmaxEnabled?:  boolean;
  airmaxCapacity?: number;
  airmaxQuality?:  number;
  stations?: Array<{
    mac:        string;
    signal?:    number;
    noiseFloor?: number;
    ccq?:       number;
    txRate?:    number;
    rxRate?:    number;
    distance?:  number;
    uptime?:    number;
  }>;
  raw?: string; // fallback si no es JSON válido
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
