import { useState, useCallback, useRef } from 'react';
import type { RouterCredentials } from '../../store/db';
import { dbService } from '../../store/db';
import { setApiToken } from '../../utils/apiClient';
import { credCache, statsCache } from '../../store/deviceDb';
import { cpeCache } from '../../store/cpeCache';
import { accountApi } from '../../services/accountApi';

export function useAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [credentials, setCredentials] = useState<RouterCredentials | undefined>();
  const [isReady, setIsReady] = useState(false);
  const isLoggingOutRef = useRef(false);

  const handleLoginSuccess = (creds: RouterCredentials) => {
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
      credCache.clear(),
      statsCache.clear(),
      cpeCache.clear(),
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
