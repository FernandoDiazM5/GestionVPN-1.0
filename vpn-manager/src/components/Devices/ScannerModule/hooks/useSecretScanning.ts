import { useState } from 'react';
import { fetchWithTimeout } from '../../../utils/fetchWithTimeout';
import { API_BASE_URL } from '../../../config';
import type { VpnSecret } from '../types';

interface UseSecretScanningReturn {
  isScanning: boolean;
  errorMsg: string;
  handleScan: (credentials: { ip?: string; user?: string; pass?: string } | null) => Promise<VpnSecret[] | null>;
}

export function useSecretScanning(): UseSecretScanningReturn {
  const [isScanning, setIsScanning] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleScan = async (credentials: { ip?: string; user?: string; pass?: string } | null): Promise<VpnSecret[] | null> => {
    setIsScanning(true);
    setErrorMsg('');
    try {
      const response = await fetchWithTimeout(`${API_BASE_URL}/api/secrets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ip: credentials?.ip,
          user: credentials?.user,
          pass: credentials?.pass,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error((data as { message?: string }).message ?? `HTTP ${response.status}`);
      }
      const realSecrets: VpnSecret[] = Array.isArray(data) ? (data as VpnSecret[]) : [];
      return realSecrets;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      setErrorMsg(`Error: ${msg}`);
      return null;
    } finally {
      setIsScanning(false);
    }
  };

  return { isScanning, errorMsg, handleScan };
}
