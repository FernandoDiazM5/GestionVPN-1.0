import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchWithTimeout } from '../../../../utils/fetchWithTimeout';

interface Node {
  id: string;
  name: string;
  remoteAddress: string;
  connectionStatus?: string;
  tunnelType?: string;
  [key: string]: any;
}

interface UseNodePollingOptions {
  intervalMs?: number;
  enabled?: boolean;
  autoSync?: boolean;
}

export function useNodePolling(options: UseNodePollingOptions = {}) {
  const { intervalMs = 5000, enabled = true } = options;
  const [nodes, setNodes] = useState<Node[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchNodes = useCallback(async () => {
    try {
      const response = await fetchWithTimeout('/api/devices/nodes', { method: 'GET' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setNodes(Array.isArray(data) ? data : []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    fetchNodes();
    if (!pollIntervalRef.current) {
      pollIntervalRef.current = setInterval(fetchNodes, intervalMs);
    }
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [enabled, fetchNodes, intervalMs]);

  const refetch = useCallback(() => {
    fetchNodes();
  }, [fetchNodes]);

  return { nodes, loading, error, refetch };
}
