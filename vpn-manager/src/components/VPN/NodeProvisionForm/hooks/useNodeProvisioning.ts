import { useState } from 'react';
import { useVpn } from '../../../../context/VpnContext';
import { fetchWithTimeout } from '../../../../utils/fetchWithTimeout';
import { API_BASE_URL } from '../../../../config';
import { PROVISION_TIMEOUT } from '../constants';
import type { ProvisionStep } from '../types';

export function useNodeProvisioning() {
  const { credentials } = useVpn();

  const [isProvisioning, setIsProvisioning] = useState(false);
  const [provisionLogs, setProvisionLogs] = useState<string[]>([]);
  const [provisionError, setProvisionError] = useState('');
  const [serverPublicKey, setWgServerPublicKey] = useState('');
  const [wgPort, setWgPort] = useState<number | null>(null);

  const addLog = (msg: string) => setProvisionLogs(prev => [...prev, msg]);

  const handleProvision = async (formData: {
    nodeNumber: string;
    nodeName: string;
    pppUser: string;
    pppPassword: string;
    lanSubnet: string;
    remoteAddress: string;
    protocol: 'sstp' | 'wireguard';
    cpePublicKey: string;
  }) => {
    if (!credentials) return;

    setIsProvisioning(true);
    setProvisionLogs([]);
    setProvisionError('');
    setWgServerPublicKey('');
    setWgPort(null);

    addLog(`Provisionando ND${formData.nodeNumber}-${formData.nodeName.toUpperCase()}...`);

    try {
      const res = await fetchWithTimeout(`${API_BASE_URL}/api/node/provision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ip: credentials.ip,
          user: credentials.user,
          pass: credentials.pass,
          nodeNumber: formData.nodeNumber,
          nodeName: formData.nodeName,
          pppUser: formData.pppUser,
          pppPassword: formData.pppPassword,
          lanSubnet: formData.lanSubnet,
          remoteAddress: formData.remoteAddress,
          protocol: formData.protocol,
          cpePublicKey: formData.cpePublicKey,
        }),
      }, PROVISION_TIMEOUT);

      const data = await res.json();

      if (data.steps) {
        data.steps.forEach((s: ProvisionStep) => {
          addLog(`✓ ${s.obj}: ${s.name}`);
        });
      }

      if (!res.ok || !data.success) {
        const failMsg = data.failedAt ? ` (falló en paso ${data.failedAt})` : '';
        throw new Error((data.message || 'Error desconocido') + failMsg);
      }

      addLog(`✓ Nodo ND${formData.nodeNumber}-${formData.nodeName.toUpperCase()} creado exitosamente`);

      if (formData.protocol === 'wireguard' && data.serverPublicKey) {
        setWgServerPublicKey(data.serverPublicKey);
        setWgPort(data.wgPort);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      setProvisionError(msg);
      addLog(`✗ Error: ${msg}`);
    } finally {
      setIsProvisioning(false);
    }
  };

  return {
    isProvisioning,
    provisionLogs,
    provisionError,
    serverPublicKey,
    wgPort,
    addLog,
    handleProvision,
    setProvisionLogs,
  };
}
