// ============================================================
//  Contexto de sesión multi-usuario (Roles v2)
//  Ejecuta useSession UNA sola vez y lo comparte con toda la app
//  (Sidebar, módulos), evitando puentes duplicados.
// ============================================================
import { createContext, useContext, type ReactNode } from 'react';
import { useSession } from '../hooks/useSession';
import type { SessionUser } from '../types/account';

interface WorkspaceSessionValue {
  session: SessionUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

const Ctx = createContext<WorkspaceSessionValue>({
  session: null, loading: true, refresh: async () => {},
});

export function WorkspaceSessionProvider({ children }: { children: ReactNode }) {
  const value = useSession();
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWorkspaceSession() {
  return useContext(Ctx);
}
