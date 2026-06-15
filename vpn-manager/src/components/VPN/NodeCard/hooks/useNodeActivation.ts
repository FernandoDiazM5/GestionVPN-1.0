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
      // Multi-usuario: el backend cierra automáticamente TU sesión previa (si la hay)
      // de forma atómica. No hace falta desactivar antes (evita parpadeo y afecta solo a ti).
      if (activeNodeVrf && activeNodeVrf !== node.nombre_vrf) {
        addLog('Cambiando de túnel (se cerrará el anterior)...');
      }
      addLog(`Configurando acceso: ${node.nombre_vrf}`);
      if (!node.nombre_vrf) throw new Error('Este nodo no tiene VRF asignado');
      // La IP de gestión la resuelve el backend (server-side); solo enviamos el VRF.
      const res = await fetchWithTimeout(`${API_BASE_URL}/api/tunnel/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetVRF: node.nombre_vrf }),
      }, 25_000);
      let data: TunnelActivateResponse & { success: boolean; message?: string; code?: string };
      try { data = await res.json(); } catch { throw new Error(`Error del servidor (HTTP ${res.status})`); }
      if (!res.ok || !data.success) {
        // Contención UX: sin IP de gestión registrada
        if (res.status === 409 && data.code === 'NO_MGMT_IP') {
          throw new Error('Tu dispositivo de gestión (WireGuard) no está registrado. Ve a la sección WireGuard y registra tu IP, o pide al moderador que te asigne una.');
        }
        throw new Error(data.message ?? `Error HTTP ${res.status}`);
      }
      addLog(`✓ Acceso abierto: ${data.vrf ?? node.nombre_vrf} (IP ${data.ipCliente ?? '—'})`);
      addLog(`Red remota: ${node.segmento_lan || 'N/A'}`);
      setActiveNodeVrf(node.nombre_vrf);
      setTunnelExpiry(data.tunnelExpiry ?? Date.now() + TUNNEL_TIMEOUT_MS);
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
