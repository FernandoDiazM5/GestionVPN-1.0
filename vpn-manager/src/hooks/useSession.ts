// ============================================================
//  useSession (Fase 4) — sesión del sistema multi-usuario
//  Consulta GET /api/account/me (cookie). Independiente del
//  login legacy; si no hay sesión nueva, session = null.
// ============================================================
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

  // Fija la sesión y, si el workspace cambió respecto al último en este
  // navegador, purga los datos locales del moderador anterior (aislamiento).
  const applySession = (user: SessionUser | null) => {
    setSession(user);
    purgeIfWorkspaceChanged(user?.workspace_id);
  };

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      // Puente primero: usa la sesión actual de la app (Bearer) para emitir
      // la cookie RBAC. Evita el 401 cosmético de probar /me sin cookie.
      const b = await accountApi.bridge();
      applySession(b.user);
    } catch {
      // Fallback: quizá ya exista una cookie válida (login reciente).
      try {
        const r = await accountApi.me();
        applySession(r.user);
      } catch {
        setSession(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { session, loading, refresh };
}
