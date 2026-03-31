import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { dbService, type VpnSecret, type RouterCredentials } from '../store/db';
import type { NodeInfo } from '../types/api';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';
import { API_BASE_URL } from '../config';
import { setApiToken, getApiToken } from '../utils/apiClient';

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
  removeNodeFromState: (pppUser: string) => void;

  // Navegación
  activeModule: 'nodes' | 'devices' | 'monitor' | 'topology' | 'settings';
  setActiveModule: React.Dispatch<React.SetStateAction<'nodes' | 'devices' | 'monitor' | 'topology' | 'settings'>>;

  // Tema
  darkMode: boolean;
  toggleDarkMode: () => void;
}

const VpnContext = createContext<VpnContextType | null>(null);

const TUNNEL_TIMEOUT_MS   = 30 * 60 * 1000; // 30 minutos
const TUNNEL_KEEPALIVE_MS =  5 * 60 * 1000; // heartbeat cada 5 minutos

export function VpnProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [credentials, setCredentials] = useState<RouterCredentials | undefined>();
  const [managedVpns, setManagedVpns] = useState<VpnSecret[]>([]);
  const [activeModule, setActiveModule] = useState<'nodes' | 'devices' | 'monitor' | 'topology' | 'settings'>(() => {
    const stored = localStorage.getItem('vpn_active_module');
    return (['nodes', 'devices', 'monitor', 'topology', 'settings'].includes(stored ?? '') ? stored : 'nodes') as 'nodes' | 'devices' | 'monitor' | 'topology' | 'settings';
  });
  const [isReady, setIsReady] = useState(false);
  const [scannedSecrets, setScannedSecrets] = useState<VpnSecret[]>([]);
  const [hasScanned, setHasScanned] = useState(false);
  const isLoggingOutRef = useRef(false);
  const deactivateOnReady = useRef(false); // túnel expirado mientras página cerrada
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const immediateSaveRef = useRef(false); // true → el próximo save omite el debounce

  // Estado de nodos VRF
  const [nodes, setNodes] = useState<NodeInfo[]>([]);
  const [activeNodeVrf, setActiveNodeVrf] = useState<string | null>(null);
  const [tunnelExpiry, setTunnelExpiry] = useState<number | null>(null);
  const [adminIP, setAdminIP] = useState('192.168.21.20');
  const timeoutRef   = useRef<ReturnType<typeof setTimeout>  | null>(null);
  const keepaliveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Ref para leer activeNodeVrf / adminIP sin capturarlos en el closure del intervalo
  const activeNodeVrfRef = useRef<string | null>(null);
  const adminIPRef       = useRef<string>('192.168.21.20');
  useEffect(() => { activeNodeVrfRef.current = activeNodeVrf; }, [activeNodeVrf]);
  useEffect(() => { adminIPRef.current = adminIP; }, [adminIP]);

  // BroadcastChannel: sincroniza estado de túnel entre pestañas del mismo origen
  const tunnelChannelRef = useRef<BroadcastChannel | null>(null);
  useEffect(() => {
    const ch = new BroadcastChannel('vpn_tunnel_sync');
    tunnelChannelRef.current = ch;
    ch.onmessage = (e) => {
      const { type, activeNodeVrf: vrf, tunnelExpiry: expiry } = e.data ?? {};
      if (type === 'tunnel_update') {
        setActiveNodeVrf(vrf ?? null);
        setTunnelExpiry(expiry ?? null);
      }
    };
    return () => { ch.close(); tunnelChannelRef.current = null; };
  }, []);

  // Emitir cambios de túnel a otras pestañas
  useEffect(() => {
    if (!isReady) return;
    tunnelChannelRef.current?.postMessage({
      type: 'tunnel_update',
      activeNodeVrf,
      tunnelExpiry,
    });
  }, [activeNodeVrf, tunnelExpiry, isReady]);

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
      // apiFetch inyecta automáticamente el JWT
      await fetchWithTimeout(`${API_BASE_URL}/api/tunnel/deactivate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
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
    if (keepaliveRef.current) {
      clearInterval(keepaliveRef.current);
      keepaliveRef.current = null;
    }
  }, [credentials]);

  // Limpiar un nodo del estado local sin tocar MikroTik (ya fue deprovisioned)
  const removeNodeFromState = useCallback((pppUser: string) => {
    // Señalar que el próximo save debe ser inmediato (sin debounce)
    // para evitar perder la eliminación si el usuario cierra el navegador
    immediateSaveRef.current = true;
    setNodes(prev => {
      const removed = prev.find(n => n.ppp_user === pppUser);
      if (!removed) return prev;
      // Si el nodo eliminado tenía el túnel activo, revocar estado local
      if (activeNodeVrfRef.current === removed.nombre_vrf) {
        setActiveNodeVrf(null);
        setTunnelExpiry(null);
        if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
        if (keepaliveRef.current) { clearInterval(keepaliveRef.current); keepaliveRef.current = null; }
      }
      return prev.filter(n => n.ppp_user !== pppUser);
    });
  }, []);

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

  // Heartbeat: cada 5 minutos verifica que las reglas mangle siguen en MikroTik
  // y las restaura si las eliminaron externamente (scheduler, reboot, etc.)
  useEffect(() => {
    if (keepaliveRef.current) {
      clearInterval(keepaliveRef.current);
      keepaliveRef.current = null;
    }
    if (!tunnelExpiry || !credentials) return;

    const sendKeepalive = async () => {
      const vrf    = activeNodeVrfRef.current;
      const hostIP = adminIPRef.current;
      if (!vrf || !hostIP) return;
      // No enviar si el túnel ya expiró
      if (Date.now() >= (tunnelExpiry)) return;
      try {
        const res = await fetchWithTimeout(`${API_BASE_URL}/api/tunnel/keepalive`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tunnelIP: hostIP, targetVRF: vrf,
          }),
        }, 12_000);
        const data = await res.json();
        if (data.restored) {
          console.warn('[KEEPALIVE] Reglas mangle restauradas automáticamente:', data.restoredItems);
        }
      } catch (err) {
        // Error silencioso — la red puede estar momentáneamente caída
        console.warn('[KEEPALIVE] Sin respuesta del router:', err);
      }
    };

    keepaliveRef.current = setInterval(sendKeepalive, TUNNEL_KEEPALIVE_MS);

    return () => {
      if (keepaliveRef.current) {
        clearInterval(keepaliveRef.current);
        keepaliveRef.current = null;
      }
    };
  }, [tunnelExpiry, credentials]);

  // Cargar estado desde DB al montar
  useEffect(() => {
    const initApp = async () => {
      try {
        const store = await dbService.getStore();
        if (store.isAuthenticated && store.credentials && store.credentials.token) {
          setIsAuthenticated(true);
          setCredentials(store.credentials);
          setApiToken(store.credentials.token);
        }
        if (store.managedVpns?.length) {
          const validVpns = store.managedVpns.filter((v) => !!v.id);
          setManagedVpns(validVpns);
        }
        if (store.scannedSecrets?.length) {
          setScannedSecrets(store.scannedSecrets);
          setHasScanned(true);
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

  // SSE: suscripción en tiempo real a cambios de túnel (cross-device)
  useEffect(() => {
    if (!isReady || !isAuthenticated) return;

    // Sync inicial desde el backend al conectar
    fetchWithTimeout(`${API_BASE_URL}/api/tunnel/status`, {}, 5_000)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.success) {
          setActiveNodeVrf(data.activeNodeVrf ?? null);
          setTunnelExpiry(data.tunnelExpiry ?? null);
        }
      })
      .catch(() => {});

    // Conexión SSE para recibir cambios en tiempo real desde cualquier dispositivo
    const token = getApiToken();
    const es = new EventSource(`${API_BASE_URL}/api/tunnel/events?token=${encodeURIComponent(token)}`);
    es.onmessage = (e) => {
      try {
        const { activeNodeVrf: vrf, tunnelExpiry: expiry } = JSON.parse(e.data);
        setActiveNodeVrf(vrf ?? null);
        setTunnelExpiry(expiry ?? null);
      } catch { /* ignorar mensajes malformados */ }
    };
    es.onerror = () => { /* reconexión automática por el browser */ };

    return () => es.close();
  }, [isReady, isAuthenticated]);

  // Detector Global de Sesión Expirada (401 devuelto por la API)
  useEffect(() => {
    const onAuthExpired = () => {
       console.warn('[AUTH] Token expirado o sesión inválida detectada por la API.');
       handleLogout();
    };

    window.addEventListener('auth_expired', onAuthExpired);
    return () => window.removeEventListener('auth_expired', onAuthExpired);
  }, []);

  // Persistir en DB cuando el estado cambie
  // Si immediateSaveRef está activo (ej: nodo eliminado), guarda sin debounce
  useEffect(() => {
    if (!isReady || isLoggingOutRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    const delay = immediateSaveRef.current ? 0 : 500;
    immediateSaveRef.current = false;
    saveTimerRef.current = setTimeout(() => {
      dbService.saveStore({
        isAuthenticated, credentials, managedVpns, scannedSecrets,
        activeNodeVrf, tunnelExpiry, adminIP, nodes,
      });
    }, delay);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [managedVpns, scannedSecrets, isAuthenticated, credentials, isReady, activeNodeVrf, tunnelExpiry, adminIP, nodes]);

  const handleLoginSuccess = (creds: RouterCredentials) => {
    setCredentials(creds);
    setIsAuthenticated(true);
    setActiveModule('nodes');
    if (creds.token) setApiToken(creds.token);
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
    setApiToken('');
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
        removeNodeFromState,
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
