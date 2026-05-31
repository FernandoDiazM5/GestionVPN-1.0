import React, { useEffect, useContext } from 'react';
import { VpnContext } from './VpnContext';
import { dbService } from '../store/db';
import {
  useAuth,
  useNodeManagement,
  useScannerState,
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
  const scanner = useScannerState();
  const navigation = useModuleNavigation();
  const theme = useDarkMode();

  // Inicializar BD
  useEffect(() => {
    const initApp = async () => {
      try {
        const store = await dbService.getStore();
        if (store.isAuthenticated && store.credentials && store.credentials.token) {
          auth.setIsAuthenticated(true);
          auth.setCredentials(store.credentials);
        }
        if (store.scannedSecrets?.length) {
          scanner.setScannedSecrets(store.scannedSecrets);
          scanner.setHasScanned(true);
        }
        if (store.adminIP) {
          nodes.setAdminIP(store.adminIP);
        }
        if (store.nodes?.length) {
          nodes.setNodes(store.nodes);
        }
        if (store.activeNodeVrf && store.tunnelExpiry) {
          if (store.tunnelExpiry > Date.now()) {
            nodes.setActiveNodeVrf(store.activeNodeVrf);
            nodes.setTunnelExpiry(store.tunnelExpiry);
          }
        }
      } catch (err) {
        console.error('Error cargando DB', err);
      } finally {
        auth.setIsReady(true);
      }
    };
    initApp();
  }, []);

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
  useTunnelKeepalive(nodes.tunnelExpiry, auth.credentials, nodes.activeNodeVrf, nodes.adminIP);
  useAuthExpiry(auth.handleLogout);

  usePersistence(auth.isReady, auth.isLoggingOutRef.current, {
    isAuthenticated: auth.isAuthenticated,
    credentials: auth.credentials,
    managedVpns: [],
    scannedSecrets: scanner.scannedSecrets,
    activeNodeVrf: nodes.activeNodeVrf,
    tunnelExpiry: nodes.tunnelExpiry,
    adminIP: nodes.adminIP,
    nodes: nodes.nodes,
  });

  // Cuando isReady, desactivar si hace falta
  useEffect(() => {
    if (auth.isReady && nodes.tunnelExpiry && nodes.tunnelExpiry <= Date.now()) {
      nodes.deactivateAllNodes(auth.credentials);
    }
  }, [auth.isReady]);

  // Logout completo
  const handleLogout = async () => {
    auth.isLoggingOutRef.current = true;
    if (nodes.activeNodeVrf) {
      await nodes.deactivateAllNodes(auth.credentials);
    }
    auth.setIsAuthenticated(false);
    auth.setCredentials(undefined);
    scanner.setScannedSecrets([]);
    scanner.setHasScanned(false);
    nodes.setNodes([]);
    nodes.setActiveNodeVrf(null);
    nodes.setTunnelExpiry(null);
    nodes.setAdminIP('192.168.21.20');
    await dbService.clearStore();
    auth.isLoggingOutRef.current = false;
  };

  const value = {
    // Auth
    isAuthenticated: auth.isAuthenticated,
    credentials: auth.credentials,
    isReady: auth.isReady,
    handleLoginSuccess: auth.handleLoginSuccess,
    handleLogout,

    // VPNs (placeholder)
    managedVpns: [] as any[],
    setManagedVpns: (() => {}) as any,

    // Scanner
    scannedSecrets: scanner.scannedSecrets,
    setScannedSecrets: scanner.setScannedSecrets,
    hasScanned: scanner.hasScanned,
    setHasScanned: scanner.setHasScanned,

    // Nodos
    nodes: nodes.nodes,
    setNodes: nodes.setNodes,
    activeNodeVrf: nodes.activeNodeVrf,
    setActiveNodeVrf: nodes.setActiveNodeVrf,
    tunnelExpiry: nodes.tunnelExpiry,
    setTunnelExpiry: nodes.setTunnelExpiry,
    adminIP: nodes.adminIP,
    setAdminIP: nodes.setAdminIP,
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
