import React, { useCallback, useEffect, useContext } from 'react';
import { VpnContext } from './VpnContext';
import { dbService } from '../store/db';
import { useSession } from '../hooks/useSession';
import {
  useAuth,
  useNodeManagement,
  useModuleNavigation,
  useDarkMode,
  useTunnelSync,
  useTunnelTimeout,
  useTunnelKeepalive,
  useAuthExpiry,
  usePersistence,
} from './hooks';

export function VpnProvider({ children }: { children: React.ReactNode }) {
  // Orquestar todos los hooks
  const auth = useAuth();
  const nodes = useNodeManagement();
  const navigation = useModuleNavigation();
  const theme = useDarkMode();
  const {
    session: restoredWorkspaceSession,
    loading: workspaceSessionLoading,
    refresh: refreshWorkspaceSession,
    clear: clearWorkspaceSession,
  } = useSession({ autoLoad: false });
  const { handleLoginSuccess: authenticate, setIsReady } = auth;
  const {
    setNodes, setActiveNodeVrf, setTunnelExpiry, deactivateAllNodes, tunnelExpiry,
  } = nodes;

  // Inicializar BD
  useEffect(() => {
    const initApp = async () => {
      try {
        const [store, session] = await Promise.allSettled([
          dbService.getStore(),
          refreshWorkspaceSession(),
        ]);
        const localState = store.status === 'fulfilled' ? store.value : {};
        if (localState.nodes?.length) {
          setNodes(localState.nodes);
        }
        if (localState.activeNodeVrf && localState.tunnelExpiry) {
          if (localState.tunnelExpiry > Date.now()) {
            setActiveNodeVrf(localState.activeNodeVrf);
            setTunnelExpiry(localState.tunnelExpiry);
          }
        }
        if (session.status === 'fulfilled' && session.value) {
          const user = session.value;
          await authenticate({
            user: user.email,
            role: user.role === 'MEMBER' ? 'viewer' : 'admin',
          });
        }
      } catch (err) {
        console.error('Error cargando DB', err);
      } finally {
        setIsReady(true);
      }
    };
    initApp();
  }, [authenticate, refreshWorkspaceSession, setActiveNodeVrf, setIsReady, setNodes, setTunnelExpiry]);

  // Hooks de sincronización y mantenimiento
  useTunnelSync(
    auth.isReady,
    auth.isAuthenticated,
    nodes.activeNodeVrf,
    nodes.tunnelExpiry,
    nodes.setActiveNodeVrf,
    nodes.setTunnelExpiry
  );

  useTunnelTimeout(nodes.tunnelExpiry, () => nodes.deactivateAllNodes(auth.credentials));
  useTunnelKeepalive(nodes.tunnelExpiry, auth.credentials, nodes.activeNodeVrf);
  useAuthExpiry(auth.handleLogout);

  usePersistence(auth.isReady, auth.isLoggingOutRef.current, {
    activeNodeVrf: nodes.activeNodeVrf,
    tunnelExpiry: nodes.tunnelExpiry,
    nodes: nodes.nodes,
  });

  // Cuando isReady, desactivar si hace falta
  useEffect(() => {
    if (auth.isReady && tunnelExpiry && tunnelExpiry <= Date.now()) {
      deactivateAllNodes(auth.credentials);
    }
  }, [auth.credentials, auth.isReady, deactivateAllNodes, tunnelExpiry]);

  const handleLoginSuccess = useCallback(async (creds: Parameters<typeof authenticate>[0]) => {
    await authenticate(creds);
    await refreshWorkspaceSession();
  }, [authenticate, refreshWorkspaceSession]);

  // Logout completo
  const handleLogout = async () => {
    if (nodes.activeNodeVrf) {
      await nodes.deactivateAllNodes(auth.credentials);
    }
    nodes.setNodes([]);
    nodes.setActiveNodeVrf(null);
    nodes.setTunnelExpiry(null);
    clearWorkspaceSession();
    await auth.handleLogout();
  };

  const value = {
    // Auth
    isAuthenticated: auth.isAuthenticated,
    credentials: auth.credentials,
    isReady: auth.isReady,
    handleLoginSuccess,
    handleLogout,
    workspaceSession: restoredWorkspaceSession,
    workspaceSessionLoading,
    refreshWorkspaceSession,

    // Nodos
    nodes: nodes.nodes,
    setNodes: nodes.setNodes,
    activeNodeVrf: nodes.activeNodeVrf,
    setActiveNodeVrf: nodes.setActiveNodeVrf,
    tunnelExpiry: nodes.tunnelExpiry,
    setTunnelExpiry: nodes.setTunnelExpiry,
    deactivateAllNodes: () => nodes.deactivateAllNodes(auth.credentials),
    removeNodeFromState: nodes.removeNodeFromState,

    // Navegación
    activeModule: navigation.activeModule,
    setActiveModule: navigation.setActiveModule,

    // Tema
    darkMode: theme.darkMode,
    toggleDarkMode: theme.toggleDarkMode,
  };

  return (
    <VpnContext.Provider value={value}>
      {children}
    </VpnContext.Provider>
  );
}

export function useVpn() {
  const ctx = useContext(VpnContext);
  if (!ctx) throw new Error('useVpn debe usarse dentro de VpnProvider');
  return ctx;
}
