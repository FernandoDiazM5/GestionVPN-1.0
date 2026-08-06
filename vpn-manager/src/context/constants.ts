// Tunnel timeouts
// Debe coincidir con el lease productivo por defecto de sessionRepo (5 min).
// El backend sigue siendo la fuente de verdad y devuelve el timestamp exacto.
export const TUNNEL_TIMEOUT_MS = 5 * 60 * 1000;       // lease de 5 minutos
export const TUNNEL_KEEPALIVE_MS = 60 * 1000;          // lease: cada minuto
export const TUNNEL_KEEPALIVE_CHECK_MS = 5000;        // 5 segundos (polling)
export const DEBOUNCE_SAVE_MS = 500;                  // 500 ms

// LocalStorage keys
export const LS_DARK_MODE = 'vpn_dark_mode';
export const LS_ACTIVE_MODULE = 'vpn_active_module';

// BroadcastChannel
export const BROADCAST_TUNNEL_SYNC = 'vpn_tunnel_sync';
