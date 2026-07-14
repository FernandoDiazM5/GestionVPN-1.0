import { useState, useEffect, useCallback } from 'react';
import { accountApi } from '../services/accountApi';
import { purgeIfWorkspaceChanged } from '../utils/sessionReset';
import type { SessionUser } from '../types/account';

interface UseSessionResult {
  session: SessionUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

export function useSession(): UseSessionResult {
  const [session, setSession] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  const applySession = (user: SessionUser | null) => {
    setSession(user);
    purgeIfWorkspaceChanged(user?.workspace_id);
  };

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await accountApi.me();
      applySession(response.user);
    } catch {
      setSession(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const id = setTimeout(refresh, 0);
    return () => clearTimeout(id);
  }, [refresh]);

  return { session, loading, refresh };
}
