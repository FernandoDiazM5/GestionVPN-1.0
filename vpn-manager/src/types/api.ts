/** Respuesta de /api/connect */
export interface ConnectResponse {
  success: boolean;
  message?: string;
}

/**
 * Sesión activa devuelta por /api/active (backend ya mapea los campos RouterOS).
 * RouterOS nativo usa `.id`, address, uptime — el backend los expone directamente.
 */
export interface ActiveSession {
  name: string;
  address: string;
  uptime: string;
  service: string;
  'caller-id'?: string;
}

/**
 * Secreto PPP devuelto por /api/secrets.
 * El backend convierte item['.id'] → id, por lo que la propiedad llega como `id`.
 * Coincide con VpnSecret del store excepto por uptime/ip que son opcionales en runtime.
 */
export interface SecretEntry {
  id: string;        // Backend mapea: item['.id'] → id
  name: string;
  service: string;
  profile: string;
  disabled: boolean;
  running: boolean;
}

/** Respuesta de /api/interface/activate */
export interface ActivateResponse {
  success: boolean;
  message?: string;
  ip?: string;
}

/** Respuesta de /api/interface/deactivate */
export interface DeactivateResponse {
  success: boolean;
  message?: string;
}

/** Nodo remoto enriquecido devuelto por /api/nodes */
export interface NodeInfo {
  id: string;
  nombre_nodo: string;
  ppp_user: string;
  segmento_lan: string;
  lan_subnets?: string[];
  nombre_vrf: string;
  service: string;
  disabled: boolean;
  running: boolean;
  ip_tunnel: string;
  uptime: string;
  /** true cuando el nodo viene del caché SQLite local (MikroTik no disponible) */
  cached?: boolean;
  /** timestamp Unix ms de la última vez que se sincronizó con MikroTik */
  last_seen?: number;
  /** timestamp Unix ms de creación en SQLite */
  created_at?: number;
}

/** Peer WireGuard devuelto por /api/wireguard/peers */
export interface WgPeer {
  id: string;
  name: string;
  allowedAddress: string;
  publicKey: string;
  lastHandshakeSecs: number | null;
  active: boolean;
}

/** Respuesta de /api/tunnel/activate */
export interface TunnelActivateResponse {
  success: boolean;
  message?: string;
}

/** Respuesta de /api/tunnel/deactivate */
export interface TunnelDeactivateResponse {
  success: boolean;
  message?: string;
}
