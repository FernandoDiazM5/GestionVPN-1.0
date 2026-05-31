import { useState } from 'react';
import { fetchWithTimeout } from '../../../../utils/fetchWithTimeout';
import { API_BASE_URL } from '../../../../config';
import type { VpnSecret, ActivateResponse, DeactivateResponse, VpnStatus } from '../types';

interface UseVpnStatusReturn {
  status: VpnStatus;
  handleActivate: (credentials: any, vpn: VpnSecret, addLog: (msg: string) => void, onUpdate: (updated: VpnSecret) => void) => Promise<void>;
  handleDeactivate: (credentials: any, vpn: VpnSecret, addLog: (msg: string) => void, onUpdate: (updated: VpnSecret) => void) => Promise<void>;
}

export function useVpnStatus(initialRunning: boolean): UseVpnStatusReturn {
  const [status, setStatus] = useState<VpnStatus>(
    initialRunning ? 'running' : 'disabled',
  );

  const handleActivate = async (
    credentials: any,
    vpn: VpnSecret,
    addLog: (msg: string) => void,
    onUpdate: (updated: VpnSecret) => void,
  ) => {
    if (!credentials) return;
    setStatus('activating');
    try {
      addLog('Enviando Enable → RouterOS API...');

      const response = await fetchWithTimeout(`${API_BASE_URL}/api/interface/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ip: credentials.ip, user: credentials.user, pass: credentials.pass,
          vpnId: vpn.id, vpnName: vpn.name, vpnService: vpn.service,
        }),
      }, 20_000);

      const data: ActivateResponse = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message ?? 'Error activando interfaz');

      setStatus('running');
      addLog(`✓ Activo · IP ${data.ip ?? 'en negociación'}`);
      onUpdate({ ...vpn, disabled: false, running: true, ip: data.ip, uptime: undefined });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      addLog(`✗ Error: ${msg}`);
      setStatus('disabled');
    }
  };

  const handleDeactivate = async (
    credentials: any,
    vpn: VpnSecret,
    addLog: (msg: string) => void,
    onUpdate: (updated: VpnSecret) => void,
  ) => {
    if (!credentials) return;
    setStatus('deleting');
    try {
      addLog('Enviando Disable → RouterOS API...');
      const response = await fetchWithTimeout(`${API_BASE_URL}/api/interface/deactivate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ip: credentials.ip, user: credentials.user, pass: credentials.pass,
          vpnId: vpn.id, vpnName: vpn.name, vpnService: vpn.service,
        }),
      }, 20_000);
      const data: DeactivateResponse = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message ?? 'Error desactivando interfaz');

      setStatus('disabled');
      addLog('✓ Secret deshabilitado');
      onUpdate({ ...vpn, disabled: true, running: false, ip: undefined, uptime: undefined });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      addLog(`✗ Error: ${msg}`);
      setStatus('running');
    }
  };

  return { status, handleActivate, handleDeactivate };
}
