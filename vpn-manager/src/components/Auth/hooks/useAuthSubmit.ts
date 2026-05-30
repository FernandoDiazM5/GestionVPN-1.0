import { useState } from 'react';
import { fetchWithTimeout } from '../../../utils/fetchWithTimeout';
import { API_BASE_URL } from '../../../config';
import { useVpn } from '../../../context/VpnContext';

export function useAuthSubmit(needsSetup: boolean | null) {
  const { handleLoginSuccess } = useVpn();
  const [isConnecting, setIsConnecting] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorDetail, setErrorDetail] = useState('');

  const handleSubmit = async (e: React.FormEvent, username: string, password: string) => {
    e.preventDefault();
    if (!username || !password) return;

    setIsConnecting(true);
    setSyncStatus('loading');
    setErrorDetail('');

    const endpoint = needsSetup ? '/api/auth/setup' : '/api/auth/login';

    try {
      const response = await fetchWithTimeout(
        `${API_BASE_URL}${endpoint}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        },
        15_000,
      );

      const data: any = await response.json();
      if (response.ok && data.success) {
        setSyncStatus('success');
        setTimeout(() => handleLoginSuccess({
            user: data.user,
            token: data.token,
            role: data.role
        }), 1000);
      } else {
        setErrorDetail(data.message ?? 'Acceso denegado.');
        setSyncStatus('error');
        setIsConnecting(false);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      setErrorDetail(msg);
      setSyncStatus('error');
      setIsConnecting(false);
    }
  };

  return {
    isConnecting,
    syncStatus,
    errorDetail,
    handleSubmit,
  };
}
