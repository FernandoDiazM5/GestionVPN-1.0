import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { dbService, type VpnSecret, type RouterCredentials } from '../store/db';
import type { NodeInfo } from '../types/api';

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
  activeModule: 'scanner' | 'control' | 'nodes';
  setActiveModule: React.Dispatch<React.SetStateAction<'scanner' | 'control' | 'nodes'>>;

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
  const [activeModule, setActiveModule] = useState<'scanner' | 'control' | 'nodes'>('scanner');
  const [isReady, setIsReady] = useState(false);
  const [scannedSecrets, setScannedSecrets] = useState<VpnSecret[]>([]);
  const [hasScanned, setHasScanned] = useState(false);
  const isLoggingOutRef = useRef(false);

  // Estado de nodos VRF
  const [nodes, setNodes] = useState<NodeInfo[]>([]);
  const [activeNodeVrf, setActiveNodeVrf] = useState<string | null>(null);
  const [tunnelExpiry, setTunnelExpiry] = useState<number | null>(null);
  const [adminIP, setAdminIP] = useState('192.168.21.20');
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Dark mode — persiste en localStorage, oscuro por defecto (entorno de red)
  const [darkMode, setDarkMode] = useState(() => {
    const stored = localStorage.getItem('vpn_dark_mode');
    return stored !== null ? stored === 'true' : false;
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    localStorage.setItem('vpn_dark_mode', String(darkMode));
  }, [darkMode]);

  const toggleDarkMode = () => setDarkMode((prev) => !prev);

  // Desactivar todos los tunnels
  const deactivateAllNodes = useCallback(async () => {
    if (!credentials) return;
    try {
      await fetch('http://localhost:3001/api/tunnel/deactivate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ip: credentials.ip,
          user: credentials.user,
          pass: credentials.pass,
        }),
      });
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
          // Filtrar entradas corruptas (id: undefined de sesiones anteriores con bug)
          const validVpns = store.managedVpns.filter((v) => !!v.id);
          setManagedVpns(validVpns);
        }
      } catch (err) {
        console.error('Error cargando DB', err);
      } finally {
        setIsReady(true);
      }
    };
    initApp();
  }, []);

  // Persistir en DB cuando el estado cambie (omitir durante logout)
  useEffect(() => {
    if (isReady && !isLoggingOutRef.current) {
      dbService.saveStore({ isAuthenticated, credentials, managedVpns });
    }
  }, [managedVpns, isAuthenticated, credentials, isReady]);

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
