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
  /** Discriminador de protocolo VPN del nodo */
  service: 'sstp' | 'wireguard';
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
  // Campos WireGuard — solo presentes cuando service === 'wireguard'
  wg_public_key?: string;
  wg_listen_port?: number;
  /** null cuando el peer nunca ha hecho handshake */
  wg_last_handshake_secs?: number | null;
  wg_allowed_ips?: string;
  // ── Multi-usuario (sesiones por usuario) ──
  /** true si EL USUARIO ACTUAL tiene este túnel activo */
  running_by_you?: boolean;
  /** (solo admin) nombre del usuario que lo tiene activo, o null */
  active_by_other?: string | null;
}

/** Peer WireGuard devuelto por /api/wireguard/peers */
export interface WgPeer {
  id: string;
  name: string;
  allowedAddress: string;
  publicKey: string;
  lastHandshakeSecs: number | null;
  active: boolean;
  /**
   * Email del usuario dueño del peer, derivado server-side por JOIN con
   * `member_wireguard` o `user_mgmt_ips`. `undefined` si el peer no está
   * mapeado a un user concreto (p. ej. peers legacy del moderador).
   */
  email?: string;
  /**
   * Alias humano libre del peer (anotación del moderador: "PC casa",
   * "Celular Personal", etc.). Vive solo en BD del panel; el `comment`
   * del peer en MikroTik no se altera para preservar trazabilidad.
   */
  alias?: string;
}

/** Respuesta de /api/tunnel/activate */
export interface TunnelActivateResponse {
  success: boolean;
  message?: string;
  vrf?: string;
  ipCliente?: string;
  deletedCount?: number;
  /** id de la sesión creada (multi-usuario) */
  sessionId?: string;
  /** timestamp Unix ms de expiración de la sesión */
  tunnelExpiry?: number;
  /** código de error de negocio (ej. NO_MGMT_IP) */
  code?: string;
}

/** Respuesta de /api/tunnel/deactivate */
export interface TunnelDeactivateResponse {
  success: boolean;
  message?: string;
}

/** Respuesta de /api/tunnel/mangle-access */
export interface MangleAccessResponse {
  success: boolean;
  message?: string;
  vrf?: string;
  ipVps?: string;
  ipCliente?: string;
  deletedCount?: number;
}

