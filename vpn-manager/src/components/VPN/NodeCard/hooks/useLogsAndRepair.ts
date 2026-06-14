import { useState, useRef, useEffect } from 'react';
import { fetchWithTimeout } from '../../../../utils/fetchWithTimeout';
import { API_BASE_URL } from '../../../../config';
import type { NodeInfo } from '../../../../types/api';

export function useLogsAndRepair(node: NodeInfo) {
  const [isRepairing, setIsRepairing] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const handleRepair = async (addLog: (msg: string) => void, setLogs: React.Dispatch<React.SetStateAction<string[]>>) => {
    setIsRepairing(true);
    setLogs([]);
    addLog('Verificando configuración MikroTik...');
    try {
      // El backend recrea la mangle POR-USUARIO desde la sesión activa del
      // solicitante (mgmt_ip → VRF); ya no se envía ningún IP desde el cliente.
      const res = await fetchWithTimeout(`${API_BASE_URL}/api/tunnel/repair`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pppUser: node.ppp_user,
          vrfName: node.nombre_vrf,
          lanSubnets: node.lan_subnets || [],
          adminWgNet: '192.168.21.0/24',
        }),
      }, 30_000);
      const data = await res.json() as { success?: boolean; message?: string; steps?: Array<{ obj: string; action?: string; status?: string }>; repaired?: number };
      if (!res.ok || !data.success) throw new Error(data.message ?? `Error HTTP ${res.status}`);
      for (const step of (data.steps || [])) {
        const icon = step.action === 'created' ? '+ ' : step.status === 'error' ? '✗ ' : '✓ ';
        addLog(`${icon}${step.obj}: ${step.action ?? step.status}`);
      }
      const repaired = data.repaired ?? 0;
      addLog(repaired > 0 ? `✓ Reparación completa (${repaired} elementos)` : '✓ Todo OK — sin cambios necesarios');
    } catch (err) {
      addLog(`✗ Error: ${err instanceof Error ? err.message : 'Error desconocido'}`);
    } finally {
      setIsRepairing(false);
      setTimeout(() => setLogs([]), 3000);
    }
  };

  return {
    isRepairing,
    logsEndRef,
    handleRepair,
  };
}
