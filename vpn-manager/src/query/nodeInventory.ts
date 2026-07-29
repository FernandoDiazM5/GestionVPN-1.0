import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { API_BASE_URL } from '../config';
import { useWorkspaceSession } from '../context/WorkspaceSession';
import type { SessionUser } from '../types/account';
import type { NodeInfo } from '../types/api';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';

export function nodeInventoryKey(session: SessionUser | null) {
  return [
    'node-inventory',
    session?.workspace_id ?? 'no-workspace',
    session?.id ?? 'no-user',
    session?.role ?? 'no-role',
    session?.platform_admin ? 'platform' : 'workspace',
  ] as const;
}

async function loadNodeInventory(): Promise<NodeInfo[]> {
  const response = await fetchWithTimeout(`${API_BASE_URL}/api/nodes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  }, 20_000);
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new Error(`Respuesta inválida del servidor (HTTP ${response.status})`);
  }
  if (!response.ok) {
    const message = typeof data === 'object' && data !== null && 'message' in data
      ? String(data.message)
      : `HTTP ${response.status}`;
    throw new Error(message);
  }
  if (!Array.isArray(data)) throw new Error('Respuesta inválida del servidor');
  return data as NodeInfo[];
}

export function useNodeInventory(enabled = true) {
  const { session } = useWorkspaceSession();
  return useQuery({
    queryKey: nodeInventoryKey(session),
    queryFn: loadNodeInventory,
    enabled: enabled && !!session?.workspace_id && !!session?.id,
  });
}

export function useNodeInventoryCache() {
  const { session } = useWorkspaceSession();
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => nodeInventoryKey(session), [session]);

  const replace = useCallback((nodes: NodeInfo[]) => {
    queryClient.setQueryData<NodeInfo[]>(queryKey, nodes);
  }, [queryClient, queryKey]);
  const update = useCallback((pppUser: string, changes: Partial<NodeInfo>) => {
    queryClient.setQueryData<NodeInfo[]>(
      queryKey,
      current => (current ?? []).map(node => (
        node.ppp_user === pppUser ? { ...node, ...changes } : node
      )),
    );
  }, [queryClient, queryKey]);
  const remove = useCallback((pppUser: string) => {
    queryClient.setQueryData<NodeInfo[]>(
      queryKey,
      current => (current ?? []).filter(node => node.ppp_user !== pppUser),
    );
  }, [queryClient, queryKey]);

  return useMemo(() => ({ replace, update, remove }), [remove, replace, update]);
}
