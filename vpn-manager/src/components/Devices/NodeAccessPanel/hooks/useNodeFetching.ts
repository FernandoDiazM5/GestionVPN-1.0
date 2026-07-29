import { useCallback, useEffect, useRef } from 'react';
import { API_BASE_URL } from '../../../../config';
import { useWorkspaceSession } from '../../../../context/WorkspaceSession';
import { useNodeInventory } from '../../../../query/nodeInventory';
import type { SessionUser } from '../../../../types/account';
import type { NodeInfo } from '../../../../types/api';
import { apiFetch } from '../../../../utils/apiClient';

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

export const NODE_CACHE_KEY = 'vpn_nodes_cache_v1';
export const NODE_CACHE_TTL_MS = 5 * 60_000;
type NodeCacheStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function nodeSessionCacheKey(session: SessionUser | null): string {
  return [
    NODE_CACHE_KEY,
    session?.workspace_id ?? 'no-workspace',
    session?.id ?? 'no-user',
    session?.role ?? 'no-role',
    session?.platform_admin ? 'platform' : 'workspace',
  ].join(':');
}

export function persistNodesCache(
  storage: NodeCacheStorage,
  nodes: NodeInfo[],
  now = Date.now(),
  cacheKey = NODE_CACHE_KEY,
): boolean {
  try {
    storage.setItem(cacheKey, JSON.stringify({ at: now, nodes }));
    return true;
  } catch {
    return false;
  }
}

export function readNodesCache(
  storage: NodeCacheStorage,
  now = Date.now(),
  cacheKey = NODE_CACHE_KEY,
): NodeInfo[] | null {
  try {
    const raw = storage.getItem(cacheKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at?: unknown; nodes?: unknown };
    const age = now - Number(parsed.at);
    if (!Number.isFinite(age) || age < 0 || age > NODE_CACHE_TTL_MS || !Array.isArray(parsed.nodes)) {
      storage.removeItem(cacheKey);
      return null;
    }
    return parsed.nodes as NodeInfo[];
  } catch {
    try { storage.removeItem(cacheKey); } catch { /* storage unavailable */ }
    return null;
  }
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
  const { session } = useWorkspaceSession();
  const sessionCacheKey = nodeSessionCacheKey(session);

  const {
    data: inventoryNodes,
    error: inventoryError,
    isFetching,
    refetch,
  } = useNodeInventory(!!credentials && isReady);

  const fetchNodes = useCallback(async () => {
    if (!credentials) return null;
    const result = await refetch();
    if (result.error) throw result.error;
    return result.data ?? null;
  }, [credentials, refetch]);

  const handleLoadNodes = useCallback(async () => {
    if (!credentials) return;
    setIsLoading(true);
    setErrorMsg('');
    try {
      const nodeList = await fetchNodes();
      if (!nodeList) throw new Error('Respuesta inválida del servidor');
    } catch (error: unknown) {
      setErrorMsg(`Error: ${error instanceof Error ? error.message : 'Error desconocido'}`);
    } finally {
      setIsLoading(false);
    }
  }, [credentials, fetchNodes, setErrorMsg, setIsLoading]);

  // La caché de sesión acelera el primer render. La consulta compartida se
  // ejecuta inmediatamente y revalida estos datos sin bloquear la pantalla.
  const bootstrapDoneRef = useRef(false);
  useEffect(() => {
    if (bootstrapDoneRef.current || !credentials || !isReady) return;
    bootstrapDoneRef.current = true;
    const cached = readNodesCache(sessionStorage, Date.now(), sessionCacheKey);
    if (!cached?.length) return;
    cached.forEach(node => { prevRunningRef.current[node.ppp_user] = node.running; });
    setNodes(cached);
    setHasLoaded(true);
  }, [credentials, isReady, prevRunningRef, sessionCacheKey, setHasLoaded, setNodes]);

  // El contexto VPN sigue siendo la fuente operativa del túnel. React Query
  // únicamente comparte/revalida el inventario entre Sitios y Buscar equipos.
  const hasSyncedLiveRef = useRef(false);
  useEffect(() => {
    if (!inventoryNodes) return;
    const detectTransitions = hasSyncedLiveRef.current;
    const disconnected = detectTransitions
      ? inventoryNodes.filter(node => prevRunningRef.current[node.ppp_user] === true && !node.running)
      : [];
    const reconnected = detectTransitions
      ? inventoryNodes.filter(node => prevRunningRef.current[node.ppp_user] === false && node.running)
      : [];

    inventoryNodes.forEach(node => {
      prevRunningRef.current[node.ppp_user] = node.running;
    });
    setNodes(inventoryNodes);
    setHasLoaded(true);
    setErrorMsg('');
    persistNodesCache(sessionStorage, inventoryNodes, Date.now(), sessionCacheKey);
    hasSyncedLiveRef.current = true;

    disconnected.forEach(node => {
      addToast(`${node.nombre_nodo} se desconectó del VPN`, 'warn');
      apiFetch(`${API_BASE_URL}/api/node/history/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pppUser: node.ppp_user, event: 'disconnected' }),
      }).catch(() => {});
    });
    reconnected.forEach(node => {
      apiFetch(`${API_BASE_URL}/api/node/history/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pppUser: node.ppp_user, event: 'connected' }),
      }).catch(() => {});
    });
  }, [addToast, inventoryNodes, prevRunningRef, sessionCacheKey, setErrorMsg, setHasLoaded, setNodes]);

  useEffect(() => {
    if (!inventoryError || hasLoaded) return;
    setErrorMsg(`Error: ${inventoryError instanceof Error ? inventoryError.message : 'Error desconocido'}`);
  }, [hasLoaded, inventoryError, setErrorMsg]);

  useEffect(() => {
    if (!hasLoaded) setIsLoading(isFetching);
  }, [hasLoaded, isFetching, setIsLoading]);

  // El polling usa la misma promesa compartida; no abre solicitudes paralelas.
  const pollErrorCountRef = useRef(0);
  const silentPoll = useCallback(async () => {
    try {
      const nodeList = await fetchNodes();
      if (!nodeList) return;
      pollErrorCountRef.current = 0;
    } catch {
      pollErrorCountRef.current += 1;
      if (pollErrorCountRef.current === 2) {
        addToast('Sin respuesta del router — verifica que WireGuard esté activo', 'warn');
      }
    }
  }, [addToast, fetchNodes]);

  useEffect(() => {
    if (!hasLoaded || !credentials) return;
    if (pollingRef.current) clearInterval(pollingRef.current);
    pollingRef.current = setInterval(silentPoll, 60_000);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [credentials, hasLoaded, pollingRef, silentPoll]);

  useEffect(() => {
    if (!tunnelExpiry) {
      setShowRenewalWarn(false);
      return;
    }
    const check = () => {
      const remaining = tunnelExpiry - Date.now();
      setShowRenewalWarn(remaining > 0 && remaining < 2 * 60 * 1000);
    };
    check();
    const id = setInterval(check, 10_000);
    return () => clearInterval(id);
  }, [setShowRenewalWarn, tunnelExpiry]);

  return { fetchNodes, handleLoadNodes, silentPoll, pollErrorCountRef };
}
