// ============================================================
//  Contexto de sesión multi-usuario (Roles v2)
//  Ejecuta useSession UNA sola vez y lo comparte con toda la app
//  (Sidebar, módulos), evitando puentes duplicados.
// ============================================================
import { createContext, useContext, type ReactNode } from 'react';
import { useVpn } from './VpnProvider';
import type { SessionUser } from '../types/account';

interface WorkspaceSessionValue {
  session: SessionUser | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<SessionUser | null>;
}

const Ctx = createContext<WorkspaceSessionValue>({
  session: null, loading: true, error: null, refresh: async () => null,
});

export function WorkspaceSessionProvider({ children }: { children: ReactNode }) {
  const {
    workspaceSession: session,
    workspaceSessionLoading: loading,
    workspaceSessionError: error,
    refreshWorkspaceSession: refresh,
  } = useVpn();
  const value = { session, loading, error, refresh };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWorkspaceSession() {
  return useContext(Ctx);
}
