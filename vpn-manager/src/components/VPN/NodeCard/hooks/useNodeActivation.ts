import { useState } from 'react';
import { apiFetch } from '../../../../utils/apiClient';
import { fetchWithTimeout } from '../../../../utils/fetchWithTimeout';
import { useVpn, TUNNEL_TIMEOUT_MS } from '../../../../context';
import { API_BASE_URL } from '../../../../config';
import type { NodeInfo, TunnelActivateResponse } from '../../../../types/api';

export function useNodeActivation(node: NodeInfo) {
  const {
    credentials,
    activeNodeVrf,
    setActiveNodeVrf,
    setTunnelExpiry,
    adminIP,
    deactivateAllNodes,
  } = useVpn();

  const [isActivating, setIsActivating] = useState(false);
  const [isDeactivating, setIsDeactivating] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (msg: string) => setLogs(prev => [...prev.slice(-8), msg]);

  const handleActivate = async () => {
    if (!credentials || !node.nombre_vrf) return;
    setIsActivating(true);
    setLogs([]);
    try {
      const isAnyNodeActive = !!activeNodeVrf;
      if (isAnyNodeActive) {
        addLog('Revocando acceso anterior...');
        await deactivateAllNodes();
      }
      addLog(`Configurando acceso: ${node.nombre_vrf}`);
      if (!adminIP) throw new Error('IP Admin no configurada — revisa la sección de WireGuard');
      if (!node.nombre_vrf) throw new Error('Este nodo no tiene VRF asignado');
      const res = await fetchWithTimeout(`${API_BASE_URL}/api/tunnel/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ip: credentials.ip,
          user: credentials.user,
          pass: credentials.pass,
          tunnelIP: adminIP,
          targetVRF: node.nombre_vrf,
        }),
      }, 25_000);
      let data: TunnelActivateResponse & { success: boolean; message?: string };
      try { data = await res.json(); } catch { throw new Error(`Error del servidor (HTTP ${res.status})`); }
      if (!res.ok || !data.success) throw new Error(data.message ?? `Error HTTP ${res.status}`);
      addLog(`✓ vpn-activa: 192.168.21.0/24`);
      addLog(`✓ Mangle ACCESO-ADMIN: 192.168.21.0/24 → ${data.vrf ?? node.nombre_vrf}`);
      addLog(`Red remota: ${node.segmento_lan || 'N/A'}`);
      setActiveNodeVrf(node.nombre_vrf);
      setTunnelExpiry(Date.now() + TUNNEL_TIMEOUT_MS);
      apiFetch(`${API_BASE_URL}/api/node/history/add`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pppUser: node.ppp_user, event: 'tunnel_activated' }),
      }).catch(() => {});
    } catch (err: unknown) {
      addLog(`✗ Error: ${err instanceof Error ? err.message : 'Error desconocido'}`);
    } finally {
      setIsActivating(false);
    }
  };

  const handleDeactivate = async () => {
    setIsDeactivating(true);
    addLog('Revocando acceso...');
    try {
      await deactivateAllNodes();
      addLog('✓ Acceso revocado correctamente');
      apiFetch(`${API_BASE_URL}/api/node/history/add`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pppUser: node.ppp_user, event: 'tunnel_deactivated' }),
      }).catch(() => {});
      setTimeout(() => setLogs([]), 1500);
    } catch (err: unknown) {
      addLog(`✗ Error: ${err instanceof Error ? err.message : 'Error desconocido'}`);
    } finally {
      setIsDeactivating(false);
    }
  };

  const isThisNodeActive = activeNodeVrf === node.nombre_vrf && !!node.nombre_vrf;
  const isAnyNodeActive = !!activeNodeVrf;
  const isPending = isActivating || isDeactivating;

  return {
    isActivating,
    isDeactivating,
    logs,
    addLog,
    handleActivate,
    handleDeactivate,
    isThisNodeActive,
    isAnyNodeActive,
    isPending,
    setLogs,
  };
}
