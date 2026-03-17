import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { dbService, type VpnSecret, type RouterCredentials } from '../store/db';
import type { NodeInfo } from '../types/api';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';

interface VpnContextType {
  // Auth
  isAuthenticated: boolean;
  credentials: RouterCredentials | undefined;
  isReady: boolean;
  handleLoginSuccess: (creds: RouterCredentials) => void;
  handleLogout: () => Promise<void>;

  // VPNs gestionadas
  managedVpns: VpnSecret[];
  setManagedVpns: React.Dispatch<React.SetStateAction<VpnSecret[]>>;

  // Estado del escáner (lifted para persistir entre cambios de tab)
  scannedSecrets: VpnSecret[];
  setScannedSecrets: React.Dispatch<React.SetStateAction<VpnSecret[]>>;
  hasScanned: boolean;
  setHasScanned: React.Dispatch<React.SetStateAction<boolean>>;

  // Nodos VRF
  nodes: NodeInfo[];
  setNodes: React.Dispatch<React.SetStateAction<NodeInfo[]>>;
  activeNodeVrf: string | null;
  setActiveNodeVrf: React.Dispatch<React.SetStateAction<string | null>>;
  tunnelExpiry: number | null;
  setTunnelExpiry: React.Dispatch<React.SetStateAction<number | null>>;
  adminIP: string;
  setAdminIP: React.Dispatch<React.SetStateAction<string>>;
  deactivateAllNodes: () => Promise<void>;

  // Navegación
  activeModule: 'scanner' | 'control' | 'nodes' | 'devices';
  setActiveModule: React.Dispatch<React.SetStateAction<'scanner' | 'control' | 'nodes' | 'devices'>>;

  // Tema
  darkMode: boolean;
  toggleDarkMode: () => void;
}

const VpnContext = createContext<VpnContextType | null>(null);

const TUNNEL_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutos

export function VpnProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [credentials, setCredentials] = useState<RouterCredentials | undefined>();
  const [managedVpns, setManagedVpns] = useState<VpnSecret[]>([]);
  const [activeModule, setActiveModule] = useState<'scanner' | 'control' | 'nodes' | 'devices'>(() => {
    const stored = localStorage.getItem('vpn_active_module');
    return (['scanner', 'control', 'nodes', 'devices'].includes(stored ?? '') ? stored : 'scanner') as 'scanner' | 'control' | 'nodes' | 'devices';
  });
  const [isReady, setIsReady] = useState(false);
  const [scannedSecrets, setScannedSecrets] = useState<VpnSecret[]>([]);
  const [hasScanned, setHasScanned] = useState(false);
  const isLoggingOutRef    = useRef(false);
  const deactivateOnReady  = useRef(false); // túnel expirado mientras página cerrada

  // Estado de nodos VRF
  const [nodes, setNodes] = useState<NodeInfo[]>([]);
  const [activeNodeVrf, setActiveNodeVrf] = useState<string | null>(null);
  const [tunnelExpiry, setTunnelExpiry] = useState<number | null>(null);
  const [adminIP, setAdminIP] = useState('192.168.21.20');
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Dark mode y módulo activo — persisten en localStorage
  const [darkMode, setDarkMode] = useState(() => {
    const stored = localStorage.getItem('vpn_dark_mode');
    return stored !== null ? stored === 'true' : false;
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    localStorage.setItem('vpn_dark_mode', String(darkMode));
  }, [darkMode]);

  useEffect(() => {
    localStorage.setItem('vpn_active_module', activeModule);
  }, [activeModule]);

  const toggleDarkMode = () => setDarkMode((prev) => !prev);

  // Desactivar todos los tunnels
  const deactivateAllNodes = useCallback(async () => {
    if (!credentials) return;
    try {
      // fetchWithTimeout evita que la llamada cuelgue si el router no responde
      await fetchWithTimeout('http://localhost:3001/api/tunnel/deactivate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ip: credentials.ip,
          user: credentials.user,
          pass: credentials.pass,
        }),
      }, 15_000);
    } catch (err) {
      console.error('Error desactivando tunnels:', err);
    }
    setActiveNodeVrf(null);
    setTunnelExpiry(null);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, [credentials]);

  // Auto-timeout: cuando se activa un tunnel, programar desactivación a los 30 min
  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (tunnelExpiry) {
      const remaining = tunnelExpiry - Date.now();
      if (remaining <= 0) {
        deactivateAllNodes();
      } else {
        timeoutRef.current = setTimeout(() => {
          deactivateAllNodes();
        }, remaining);
      }
    }
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [tunnelExpiry, deactivateAllNodes]);

  // Cargar estado desde DB al montar
  useEffect(() => {
    const initApp = async () => {
      try {
        const store = await dbService.getStore();
        if (store.isAuthenticated && store.credentials) {
          setIsAuthenticated(true);
          setCredentials(store.credentials);
        }
        if (store.managedVpns?.length) {
          const validVpns = store.managedVpns.filter((v) => !!v.id);
          setManagedVpns(validVpns);
        }
        if (store.adminIP) {
          setAdminIP(store.adminIP);
        }
        if (store.nodes?.length) {
          setNodes(store.nodes);
        }
        if (store.activeNodeVrf && store.tunnelExpiry) {
          if (store.tunnelExpiry > Date.now()) {
            // Túnel aún válido — restaurar estado, el auto-timeout lo tomará
            setActiveNodeVrf(store.activeNodeVrf);
            setTunnelExpiry(store.tunnelExpiry);
          } else {
            // Túnel expiró mientras la página estaba cerrada → limpiar RouterOS al arrancar
            deactivateOnReady.current = true;
          }
        }
      } catch (err) {
        console.error('Error cargando DB', err);
      } finally {
        setIsReady(true);
      }
    };
    initApp();
  }, []);

  // Si el túnel expiró con la página cerrada, limpiar RouterOS al estar listo
  useEffect(() => {
    if (isReady && deactivateOnReady.current) {
      deactivateOnReady.current = false;
      deactivateAllNodes();
    }
  }, [isReady, deactivateAllNodes]);

  // Persistir en DB cuando el estado cambie (omitir durante logout)
  useEffect(() => {
    if (isReady && !isLoggingOutRef.current) {
      dbService.saveStore({
        isAuthenticated, credentials, managedVpns,
        activeNodeVrf, tunnelExpiry, adminIP, nodes,
      });
    }
  }, [managedVpns, isAuthenticated, credentials, isReady, activeNodeVrf, tunnelExpiry, adminIP, nodes]);

  const handleLoginSuccess = (creds: RouterCredentials) => {
    setCredentials(creds);
    setIsAuthenticated(true);
    setActiveModule('scanner');
  };

  const handleLogout = async () => {
    isLoggingOutRef.current = true;
    // Revocar acceso si hay un tunnel activo
    if (activeNodeVrf) {
      await deactivateAllNodes();
    }
    setIsAuthenticated(false);
    setCredentials(undefined);
    setManagedVpns([]);
    setScannedSecrets([]);
    setHasScanned(false);
    setNodes([]);
    setActiveNodeVrf(null);
    setTunnelExpiry(null);
    setAdminIP('192.168.21.20');
    localStorage.removeItem('vpn_active_module');
    await dbService.clearStore();
    isLoggingOutRef.current = false;
  };

  return (
    <VpnContext.Provider
      value={{
        isAuthenticated,
        credentials,
        isReady,
        handleLoginSuccess,
        handleLogout,
        managedVpns,
        setManagedVpns,
        scannedSecrets,
        setScannedSecrets,
        hasScanned,
        setHasScanned,
        nodes,
        setNodes,
        activeNodeVrf,
        setActiveNodeVrf,
        tunnelExpiry,
        setTunnelExpiry,
        adminIP,
        setAdminIP,
        deactivateAllNodes,
        activeModule,
        setActiveModule,
        darkMode,
        toggleDarkMode,
      }}
    >
      {children}
    </VpnContext.Provider>
  );
}

export function useVpn(): VpnContextType {
  const ctx = useContext(VpnContext);
  if (!ctx) throw new Error('useVpn debe usarse dentro de VpnProvider');
  return ctx;
}

export { TUNNEL_TIMEOUT_MS };
