import { useState, useCallback, useRef } from 'react';
import type { RouterCredentials } from '../../store/db';
import { setApiToken } from '../../utils/apiClient';
import { credCache, statsCache } from '../../store/deviceDb';
import { cpeCache } from '../../store/cpeCache';

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
    // Limpia las cachés locales (IndexedDB) para que en una máquina compartida
    // los datos de escaneo/dispositivos/CPEs de un moderador no queden visibles
    // para el siguiente que inicie sesión.
    await Promise.allSettled([credCache.clear(), statsCache.clear(), cpeCache.clear()]);
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
