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
