import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { dbService, type VpnSecret, type RouterCredentials } from '../store/db';

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

  // Navegación
  activeModule: 'scanner' | 'control';
  setActiveModule: React.Dispatch<React.SetStateAction<'scanner' | 'control'>>;

  // Tema
  darkMode: boolean;
  toggleDarkMode: () => void;
}

const VpnContext = createContext<VpnContextType | null>(null);

export function VpnProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [credentials, setCredentials] = useState<RouterCredentials | undefined>();
  const [managedVpns, setManagedVpns] = useState<VpnSecret[]>([]);
  const [activeModule, setActiveModule] = useState<'scanner' | 'control'>('scanner');
  const [isReady, setIsReady] = useState(false);
  const [scannedSecrets, setScannedSecrets] = useState<VpnSecret[]>([]);
  const [hasScanned, setHasScanned] = useState(false);
  const isLoggingOutRef = useRef(false);

  // Dark mode — persiste en localStorage, oscuro por defecto (entorno de red)
  const [darkMode, setDarkMode] = useState(() => {
    const stored = localStorage.getItem('vpn_dark_mode');
    return stored !== null ? stored === 'true' : true;
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    localStorage.setItem('vpn_dark_mode', String(darkMode));
  }, [darkMode]);

  const toggleDarkMode = () => setDarkMode((prev) => !prev);

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
    setIsAuthenticated(false);
    setCredentials(undefined);
    setManagedVpns([]);
    setScannedSecrets([]);
    setHasScanned(false);
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
