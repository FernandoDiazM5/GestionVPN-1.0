import { useState, useCallback, useRef } from 'react';
import type { RouterCredentials } from '../../store/db';
import { dbService } from '../../store/db';
import { setApiToken } from '../../utils/apiClient';
import { credCache, statsCache } from '../../store/deviceDb';
import { cpeCache } from '../../store/cpeCache';
import { accountApi } from '../../services/accountApi';

const LAST_USER_KEY = 'vpn_last_user';

// Limpia TODOS los datos locales de un usuario (resultados de escaneo en
// sessionStorage, CPEs/stats/credenciales en IndexedDB). Evita que los datos
// de un moderador se "filtren" al siguiente que use el mismo navegador.
async function clearUserScopedData() {
  try { sessionStorage.clear(); } catch { /* ignore */ }
  await Promise.allSettled([credCache.clear(), statsCache.clear(), cpeCache.clear()]);
}

export function useAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [credentials, setCredentials] = useState<RouterCredentials | undefined>();
  const [isReady, setIsReady] = useState(false);
  const isLoggingOutRef = useRef(false);

  const handleLoginSuccess = async (creds: RouterCredentials) => {
    // Si inicia sesión un usuario DISTINTO al anterior en este navegador,
    // purga las cachés locales del usuario previo antes de mostrar la app.
    try {
      const last = localStorage.getItem(LAST_USER_KEY);
      if (last && last !== (creds.user || '')) await clearUserScopedData();
      localStorage.setItem(LAST_USER_KEY, creds.user || '');
    } catch { /* ignore */ }
    setCredentials(creds);
    setIsAuthenticated(true);
    if (creds.token) setApiToken(creds.token);
  };

  const handleLogout = useCallback(async () => {
    isLoggingOutRef.current = true;
    setIsAuthenticated(false);
    setCredentials(undefined);
    setApiToken('');
    // Cierra la sesión completa para que NO quede estado obsoleto que dispare 401:
    //  1) cookie de sesión RBAC en el servidor (/api/account/logout)
    //  2) credenciales persistidas + clave de cifrado del navegador (clearStore)
    //  3) cachés locales (escaneo/dispositivos/CPEs) — privacidad en máquina compartida
    await Promise.allSettled([
      accountApi.logout(),
      dbService.clearStore(),
      clearUserScopedData(),
    ]);
    isLoggingOutRef.current = false;
  }, []);

  return {
    isAuthenticated,
    setIsAuthenticated,
    credentials,
    setCredentials,
    isReady,
    setIsReady,
    handleLoginSuccess,
    handleLogout,
    isLoggingOutRef,
  };
}
