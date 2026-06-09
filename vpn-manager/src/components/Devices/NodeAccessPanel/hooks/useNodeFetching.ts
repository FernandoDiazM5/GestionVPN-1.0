import { useCallback, useRef, useEffect } from 'react';
import { apiFetch } from '../../../../utils/apiClient';
import { fetchWithTimeout } from '../../../../utils/fetchWithTimeout';
import { API_BASE_URL } from '../../../../config';
import type { NodeInfo } from '../../../../types/api';

interface UseNodeFetchingProps {
  credentials: { ip?: string; user: string; pass?: string } | null | undefined;
  isReady: boolean;
  hasLoaded: boolean;
  setHasLoaded: (value: boolean) => void;
  setNodes: (nodes: NodeInfo[]) => void;
  setIsLoading: (value: boolean) => void;
  setErrorMsg: (value: string) => void;
  setShowRenewalWarn: (value: boolean) => void;
  tunnelExpiry: number | null;
  prevRunningRef: React.MutableRefObject<Record<string, boolean>>;
  pollingRef: React.MutableRefObject<ReturnType<typeof setInterval> | null>;
  addToast: (text: string, type: 'warn' | 'info') => void;
}

export function useNodeFetching(props: UseNodeFetchingProps) {
  const {
    credentials,
    isReady,
    hasLoaded,
    setHasLoaded,
    setNodes,
    setIsLoading,
    setErrorMsg,
    setShowRenewalWarn,
    tunnelExpiry,
    prevRunningRef,
    pollingRef,
    addToast,
  } = props;

  const fetchNodes = useCallback(async () => {
    if (!credentials) return null;
    const res = await fetchWithTimeout(`${API_BASE_URL}/api/nodes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ip: credentials.ip, user: credentials.user, pass: credentials.pass }),
    }, 20_000);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return Array.isArray(data) ? data as NodeInfo[] : null;
  }, [credentials]);

  // Cache persistente en sessionStorage para sobrevivir cambios de pestaña.
  // TTL: solo invalida al hacer F5 o cerrar la pestaña. Mientras esté viva la
  // sesión, los datos se mantienen y solo se refrescan vía botón "Actualizar".
  const CACHE_KEY = 'vpn_nodes_cache_v1';

  const persistCache = (list: NodeInfo[]) => {
    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), nodes: list })); } catch { /* ignore */ }
  };

  const readCache = (): NodeInfo[] | null => {
    try {
      const raw = sessionStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed?.nodes) ? parsed.nodes as NodeInfo[] : null;
    } catch { return null; }
  };

  const handleLoadNodes = async () => {
    if (!credentials) return;
    setIsLoading(true);
    setErrorMsg('');
    try {
      const nodeList = await fetchNodes();
      if (!nodeList) throw new Error('Respuesta inválida del servidor');
      // Inicializar estado previo de running para el polling
      nodeList.forEach(n => {
        prevRunningRef.current[n.ppp_user] = n.running;
      });
      setNodes(nodeList);
      setHasLoaded(true);
      persistCache(nodeList);
    } catch (err: unknown) {
      setErrorMsg(`Error: ${err instanceof Error ? err.message : 'Error desconocido'}`);
    } finally {
      setIsLoading(false);
    }
  };

  // ── Restauración del cache + autoload de primera vez ────────────────
  // En cada montaje (al cambiar de pestaña y volver) restauramos desde cache.
  // Si no hay cache, hacemos UN autoload contra el router. El botón "Actualizar"
  // sigue siendo la única forma de forzar refetch dentro de la sesión.
  const bootstrapDoneRef = useRef(false);
  useEffect(() => {
    if (bootstrapDoneRef.current) return;
    if (!credentials || !isReady) return;
    bootstrapDoneRef.current = true;
    const cached = readCache();
    if (cached && cached.length) {
      cached.forEach(n => { prevRunningRef.current[n.ppp_user] = n.running; });
      setNodes(cached);
      setHasLoaded(true);
    } else if (!hasLoaded) {
      // Autoload de primera vez: el usuario abrió la pestaña sin cache previa
      void handleLoadNodes();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [credentials, isReady]);

  // Polling silencioso cada 60s — detecta desconexiones
  const pollErrorCountRef = useRef(0);
  const silentPoll = useCallback(async () => {
    try {
      const nodeList = await fetchNodes();
      if (!nodeList) return;
      pollErrorCountRef.current = 0; // reset contador de errores al tener éxito
      const disconnected = nodeList.filter(
        n => prevRunningRef.current[n.ppp_user] === true && !n.running
      );
      const reconnected = nodeList.filter(
        n => prevRunningRef.current[n.ppp_user] === false && n.running
      );
      nodeList.forEach(n => {
        prevRunningRef.current[n.ppp_user] = n.running;
      });
      setNodes(nodeList);
      persistCache(nodeList);
      disconnected.forEach(n => {
        addToast(`${n.nombre_nodo} se desconectó del VPN`, 'warn');
        apiFetch(`${API_BASE_URL}/api/node/history/add`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pppUser: n.ppp_user, event: 'disconnected' }),
        }).catch(() => {});
      });
      reconnected.forEach(n => {
        apiFetch(`${API_BASE_URL}/api/node/history/add`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pppUser: n.ppp_user, event: 'connected' }),
        }).catch(() => {});
      });
    } catch {
      pollErrorCountRef.current += 1;
      // Avisar al usuario después de 2 fallos consecutivos (2 min sin respuesta)
      if (pollErrorCountRef.current === 2) {
        addToast('Sin respuesta del router — verifica que WireGuard esté activo', 'warn');
      }
    }
  }, [fetchNodes, setNodes, addToast]);

  // Iniciar polling cuando hay nodos cargados
  useEffect(() => {
    if (!hasLoaded || !credentials) return;
    if (pollingRef.current) clearInterval(pollingRef.current);
    pollingRef.current = setInterval(silentPoll, 60_000);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [hasLoaded, credentials, silentPoll]);

  // Auto-sync silencioso al montar
  const autoSyncRanRef = useRef(false);
  useEffect(() => {
    if (!isReady || !credentials || autoSyncRanRef.current) return;
    autoSyncRanRef.current = true;
    const timer = setTimeout(async () => {
      try {
        const live = await fetchNodes();
        if (!live) return;
        setNodes(live);
        setHasLoaded(true);
      } catch {
        // Silencioso — si el backend no responde, conservar caché
      }
    }, 2000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, credentials]);

  // Alerta de renovación cuando quedan < 2 min
  useEffect(() => {
    if (!tunnelExpiry) {
      setShowRenewalWarn(false);
      return;
    }
    const check = () => {
      const rem = tunnelExpiry - Date.now();
      setShowRenewalWarn(rem > 0 && rem < 2 * 60 * 1000);
    };
    check();
    const id = setInterval(check, 10_000);
    return () => clearInterval(id);
  }, [tunnelExpiry, setShowRenewalWarn]);

  return { fetchNodes, handleLoadNodes, silentPoll, pollErrorCountRef };
}
