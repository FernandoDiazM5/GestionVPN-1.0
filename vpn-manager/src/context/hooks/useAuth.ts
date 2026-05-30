import { useState, useCallback, useRef } from 'react';
import type { RouterCredentials } from '../../store/db';
import { setApiToken } from '../../utils/apiClient';

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
