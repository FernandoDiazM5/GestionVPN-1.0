import { rowStyles } from '../utils/styles';

const LABELS: Record<string, string> = {
  hostname: 'Nombre del equipo', devmodel: 'Modelo', fwversion: 'Versión de firmware',
  fwprefix: 'Familia de firmware', uptime: 'Tiempo encendido', time: 'Fecha y hora del equipo',
  cpuload: 'Uso de CPU', loadavg: 'Carga promedio', netrole: 'Rol de red',
  'memory total': 'Memoria total', 'memory free': 'Memoria libre',
  'memory buffers': 'Búferes de memoria', 'memory cached': 'Memoria en caché',
  'memory uso %': 'Uso de memoria', temperature: 'Temperatura', height: 'Altura configurada',
  mode: 'Modo inalámbrico', essid: 'Nombre de red (SSID)', hide_essid: 'Visibilidad del SSID',
  security: 'Seguridad inalámbrica', countrycode: 'País / dominio regulatorio',
  'wlan mac': 'MAC inalámbrica', apmac: 'MAC del punto de acceso', signal: 'Señal',
  rssi: 'RSSI', noisefloor: 'Piso de ruido', txpower: 'Potencia de transmisión',
  antenna_gain: 'Ganancia de antena', antenna: 'Antena', distance: 'Distancia', ccq: 'Calidad CCQ',
  chainrssi: 'Señal por cadena', frequency: 'Frecuencia', channel: 'Canal',
  chanbw: 'Ancho de canal', chanbw_ext: 'Extensión del canal', freq_range: 'Rango de frecuencia',
  opmode: 'Modo operativo', center1_freq: 'Frecuencia central', tx_idx: 'Índice TX', rx_idx: 'Índice RX',
  tx_nss: 'Flujos espaciales TX', rx_nss: 'Flujos espaciales RX',
  tx_chainmask: 'Máscara de cadenas TX', rx_chainmask: 'Máscara de cadenas RX',
  chain_names: 'Nombres de cadenas', txrate: 'Velocidad TX', rxrate: 'Velocidad RX', chains: 'Cadenas MIMO',
  'airMAX quality': 'Calidad airMAX', 'airMAX capacity': 'Capacidad airMAX',
  'airMAX priority': 'Prioridad airMAX', dcap: 'Capacidad de descarga', ucap: 'Capacidad de subida',
  'airtime total': 'Uso total del aire', tx_airtime: 'Uso del aire TX', rx_airtime: 'Uso del aire RX',
  cinr: 'Relación portadora/interferencia', evm: 'Magnitud del vector de error',
  tx_latency: 'Latencia TX', fixed_frame: 'Trama fija', gps_sync: 'Sincronización GPS',
  airsync_mode: 'Modo airSync', atpc_status: 'Control automático de potencia',
  tx_retries: 'Reintentos TX', missed_beacons: 'Beacons perdidos', rx_crypts: 'Errores de cifrado RX',
  'wlan (ath0)': 'Interfaz inalámbrica', 'eth0 (lan)': 'Interfaz LAN',
  'lan speed': 'Velocidad LAN', 'lan info': 'Estado del enlace LAN', airMAX: 'Estado de airMAX',
};

export default function M5Row({ label, value }: { label: string; value?: string | number | null }) {
  if (value == null || value === '') return null;
  return (
    <div className={rowStyles.container}>
      <span className={rowStyles.label}>{LABELS[label] || label}</span>
      <span className={rowStyles.value}>{String(value)}</span>
    </div>
  );
}
