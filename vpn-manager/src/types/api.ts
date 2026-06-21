// ============================================================
//  api.ts — tipos de las respuestas del backend.
//
//  Fase F5.C: los tipos que tienen su origen autoritativo en el
//  backend (peer WG, tunnel responses) se re-exportan de
//  @gestionvpn/contracts para evitar drift. Los tipos puramente
//  cliente (anotaciones, agregados de UI) se mantienen aquí.
// ============================================================

// ── Tipos derivados de schemas Zod compartidos (origen: backend) ──
export type { WgPeer } from '@gestionvpn/contracts';
export type {
  TunnelActivateResponse,
  TunnelStatusResponse,
  KeepaliveResponse,
  TunnelErrorCode,
} from '@gestionvpn/contracts';

// ── Tipos exclusivos del frontend (no salen del cliente) ──

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

/**
 * Nodo enriquecido devuelto por /api/nodes.
 *
 * NOTA: comparte ~70% de campos con `NodeListItem` de @gestionvpn/contracts,
 * pero el frontend añade campos derivados que el backend NO emite directamente:
 *   • running_by_you / active_by_other — anotación multi-usuario hecha por
 *     `annotateSessions()` en la respuesta.
 *   • cached / last_seen / created_at — metadatos del caché MySQL.
 * Por eso se mantiene este interface en lugar de re-exportar.
 */
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

/** Respuesta de /api/tunnel/deactivate */
export interface TunnelDeactivateResponse {
  success: boolean;
  message?: string;
}
