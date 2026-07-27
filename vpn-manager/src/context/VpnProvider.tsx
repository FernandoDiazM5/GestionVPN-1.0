import React, { useCallback, useEffect, useContext, useRef } from 'react';
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
  useSessionExpiry,
  usePersistence,
} from './hooks';
import SessionExpiryDialog from '../components/Auth/SessionExpiryDialog';

export function VpnProvider({ children }: { children: React.ReactNode }) {
  // Orquestar todos los hooks
  const auth = useAuth();
  const nodes = useNodeManagement();
  const navigation = useModuleNavigation(auth.isAuthenticated);
  const theme = useDarkMode();
  const {
    session: restoredWorkspaceSession,
    loading: workspaceSessionLoading,
    error: workspaceSessionError,
    refresh: refreshWorkspaceSession,
    clear: clearWorkspaceSession,
  } = useSession({ autoLoad: false });
  const { handleLoginSuccess: authenticate, setIsReady } = auth;
  const {
    setNodes, setActiveNodeVrf, setTunnelExpiry,
    deactivateAllNodes: deactivateManagedNodes,
  } = nodes;
  const initializationStarted = useRef(false);
  const logoutInProgress = useRef(false);

  // Inicializar BD
  useEffect(() => {
    if (initializationStarted.current) return;
    initializationStarted.current = true;
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

  const deactivateExpiredTunnel = useCallback(
    () => deactivateManagedNodes(auth.credentials),
    [auth.credentials, deactivateManagedNodes],
  );
  useTunnelTimeout(nodes.tunnelExpiry, deactivateExpiredTunnel);
  useTunnelKeepalive(nodes.tunnelExpiry, auth.credentials, nodes.activeNodeVrf);
  useAuthExpiry(auth.handleLogout);
  const sessionExpiry = useSessionExpiry(auth.isAuthenticated, auth.handleLogout);

  usePersistence(auth.isReady, auth.isLoggingOutRef.current, {
    activeNodeVrf: nodes.activeNodeVrf,
    tunnelExpiry: nodes.tunnelExpiry,
    nodes: nodes.nodes,
  });

  const handleLoginSuccess = useCallback(async (creds: Parameters<typeof authenticate>[0]) => {
    await authenticate(creds);
    await refreshWorkspaceSession();
  }, [authenticate, refreshWorkspaceSession]);

  // Logout completo
  const handleLogout = async () => {
    if (logoutInProgress.current) return;
    logoutInProgress.current = true;
    try {
      if (nodes.activeNodeVrf) {
        try {
          await nodes.deactivateAllNodes(auth.credentials);
        } catch (error) {
          // El cierre de la sesión web no debe quedar bloqueado por una caída
          // del router. El backend conserva la sesión VPN para reintentar su
          // limpieza por expiración en lugar de reportar una revocación falsa.
          console.warn(
            '[VPNContext] No se pudo revocar el túnel antes de cerrar sesión.',
            error instanceof Error ? error.message : 'Error desconocido',
          );
        }
      }
      nodes.setNodes([]);
      nodes.setActiveNodeVrf(null);
      nodes.setTunnelExpiry(null);
      clearWorkspaceSession();
      await auth.handleLogout();
    } finally {
      logoutInProgress.current = false;
    }
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
    workspaceSessionError,
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
    isNotFound: navigation.isNotFound,

    // Tema
    darkMode: theme.darkMode,
    toggleDarkMode: theme.toggleDarkMode,
  };

  return (
    <VpnContext.Provider value={value}>
      {children}
      <SessionExpiryDialog
        secondsLeft={sessionExpiry.secondsLeft}
        onContinue={sessionExpiry.continueSession}
      />
    </VpnContext.Provider>
  );
}

export function useVpn() {
  const ctx = useContext(VpnContext);
  if (!ctx) throw new Error('useVpn debe usarse dentro de VpnProvider');
  return ctx;
}
