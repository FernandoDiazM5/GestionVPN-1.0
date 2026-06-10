// ============================================================
//  useDeepLinks — captura deep-links del bot Telegram (M1)
//
//  El bot envía URLs como:
//     APP_BASE_URL?activate=VRF-X
//     APP_BASE_URL?deactivate=1
//
//  Este hook corre UNA vez al cargar la app:
//   1) Lee el query param.
//   2) Lo guarda en sessionStorage (sobrevive al flujo de login si el
//      usuario aún no está autenticado).
//   3) Limpia el URL para que un refresh no vuelva a disparar la acción.
//
//  Después del login, NodeAccessPanel (o el módulo correspondiente) lee
//  sessionStorage y ejecuta la acción.
//
//  Convención de claves:
//     'pending_tunnel_activate'   → string con el VRF
//     'pending_tunnel_deactivate' → '1'
// ============================================================
import { useEffect } from 'react';

export const PENDING_ACTIVATE_KEY = 'pending_tunnel_activate';
export const PENDING_DEACTIVATE_KEY = 'pending_tunnel_deactivate';

let _initialized = false;

/**
 * Captura el deep-link UNA sola vez por carga de página.
 * Llamar desde el componente raíz (App.tsx) antes de cualquier otra cosa.
 */
export function useDeepLinks() {
  useEffect(() => {
    if (_initialized) return;
    _initialized = true;

    try {
      const sp = new URLSearchParams(window.location.search);
      const activate = sp.get('activate');
      const deactivate = sp.get('deactivate');
      if (!activate && !deactivate) return;

      if (activate) sessionStorage.setItem(PENDING_ACTIVATE_KEY, activate);
      if (deactivate === '1') sessionStorage.setItem(PENDING_DEACTIVATE_KEY, '1');

      // Limpia el URL — sin recargar — para que refresh no re-dispare.
      sp.delete('activate');
      sp.delete('deactivate');
      const newQs = sp.toString();
      const newUrl = window.location.pathname + (newQs ? `?${newQs}` : '') + window.location.hash;
      window.history.replaceState({}, '', newUrl);
    } catch {
      // sessionStorage o URLSearchParams no disponibles — ignorar.
    }
  }, []);
}

/** Lee y consume el deep-link de activación. Devuelve el VRF o null. */
export function consumePendingActivate(): string | null {
  try {
    const v = sessionStorage.getItem(PENDING_ACTIVATE_KEY);
    if (v) sessionStorage.removeItem(PENDING_ACTIVATE_KEY);
    return v;
  } catch { return null; }
}

/** Lee y consume el deep-link de desactivación. Devuelve true o false. */
export function consumePendingDeactivate(): boolean {
  try {
    const v = sessionStorage.getItem(PENDING_DEACTIVATE_KEY);
    if (v) sessionStorage.removeItem(PENDING_DEACTIVATE_KEY);
    return v === '1';
  } catch { return false; }
}
