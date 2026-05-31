// ============================================================
//  useSession (Fase 4) — sesión del sistema multi-usuario
//  Consulta GET /api/account/me (cookie). Independiente del
//  login legacy; si no hay sesión nueva, session = null.
// ============================================================
import { useState, useEffect, useCallback } from 'react';
import { accountApi } from '../services/accountApi';
import type { SessionUser } from '../types/account';

interface UseSessionResult {
  session: SessionUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

export function useSession(): UseSessionResult {
  const [session, setSession] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await accountApi.me();
      setSession(r.user);
    } catch {
      setSession(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { session, loading, refresh };
}
