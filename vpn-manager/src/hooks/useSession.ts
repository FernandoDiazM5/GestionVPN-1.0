import { useState, useEffect, useCallback } from 'react';
import { accountApi } from '../services/accountApi';
import { purgeIfWorkspaceChanged } from '../utils/sessionReset';
import type { SessionUser } from '../types/account';

interface UseSessionOptions {
  autoLoad?: boolean;
}

export interface UseSessionResult {
  session: SessionUser | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<SessionUser | null>;
  clear: () => void;
}

export function useSession({ autoLoad = true }: UseSessionOptions = {}): UseSessionResult {
  const [session, setSession] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(autoLoad);
  const [error, setError] = useState<string | null>(null);

  const applySession = useCallback((user: SessionUser | null) => {
    setSession(user);
    purgeIfWorkspaceChanged(user?.workspace_id);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await accountApi.me();
      applySession(response.user);
      return response.user;
    } catch (reason) {
      setSession(null);
      setError(reason instanceof Error ? reason.message : 'No se pudo recuperar la sesion.');
      return null;
    } finally {
      setLoading(false);
    }
  }, [applySession]);

  const clear = useCallback(() => {
    setSession(null);
    setLoading(false);
    setError(null);
  }, []);

  useEffect(() => {
    if (!autoLoad) return;
    const id = setTimeout(refresh, 0);
    return () => clearTimeout(id);
  }, [autoLoad, refresh]);

  return { session, loading, error, refresh, clear };
}
