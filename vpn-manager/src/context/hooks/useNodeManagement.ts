import { useState, useCallback, useRef } from 'react';
import type { NodeInfo } from '../../types/api';
import { fetchWithTimeout } from '../../utils/fetchWithTimeout';
import { API_BASE_URL } from '../../config';

export function useNodeManagement() {
  const [nodes, setNodes] = useState<NodeInfo[]>([]);
  const [activeNodeVrf, setActiveNodeVrf] = useState<string | null>(null);
  const [tunnelExpiry, setTunnelExpiry] = useState<number | null>(null);
  const [adminIP, setAdminIP] = useState('192.168.21.20');

  const timeoutRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const keepaliveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeNodeVrfRef = useRef<string | null>(null);
  const adminIPRef = useRef<string>('192.168.21.20');

  const deactivateAllNodes = useCallback(async (credentials: any) => {
    if (!credentials) return;
    try {
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
      clearInterval(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (keepaliveRef.current) {
      clearInterval(keepaliveRef.current);
      keepaliveRef.current = null;
    }
  }, []);

  const removeNodeFromState = useCallback((pppUser: string) => {
    setNodes(prev => {
      const removed = prev.find(n => n.ppp_user === pppUser);
      if (!removed) return prev;
      if (activeNodeVrfRef.current === removed.nombre_vrf) {
        setActiveNodeVrf(null);
        setTunnelExpiry(null);
        if (timeoutRef.current) { clearInterval(timeoutRef.current); timeoutRef.current = null; }
        if (keepaliveRef.current) { clearInterval(keepaliveRef.current); keepaliveRef.current = null; }
      }
      return prev.filter(n => n.ppp_user !== pppUser);
    });
  }, []);

  return {
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
    timeoutRef,
    keepaliveRef,
    activeNodeVrfRef,
    adminIPRef,
  };
}
