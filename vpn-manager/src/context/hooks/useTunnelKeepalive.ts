import { useEffect, useRef } from 'react';
import { fetchWithTimeout } from '../../utils/fetchWithTimeout';
import { API_BASE_URL } from '../../config';
import { TUNNEL_KEEPALIVE_MS } from '../constants';

export function useTunnelKeepalive(
  tunnelExpiry: number | null,
  credentials: any,
  activeNodeVrf: string | null,
  adminIP: string
) {
  const keepaliveRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (keepaliveRef.current) {
      clearInterval(keepaliveRef.current);
      keepaliveRef.current = null;
    }
    if (!tunnelExpiry || !credentials) return;

    const sendKeepalive = async () => {
      if (!activeNodeVrf || !adminIP) return;
      if (Date.now() >= tunnelExpiry) return;
      try {
        const res = await fetchWithTimeout(`${API_BASE_URL}/api/tunnel/keepalive`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tunnelIP: adminIP,
            targetVRF: activeNodeVrf,
          }),
        }, 12_000);
        const data = await res.json();
        if (data.restored) {
          console.warn('[KEEPALIVE] Reglas mangle restauradas:', data.restoredItems);
        }
      } catch (err) {
        console.warn('[KEEPALIVE] Sin respuesta del router:', err);
      }
    };

    keepaliveRef.current = setInterval(sendKeepalive, TUNNEL_KEEPALIVE_MS);

    return () => {
      if (keepaliveRef.current) {
        clearInterval(keepaliveRef.current);
        keepaliveRef.current = null;
      }
    };
  }, [tunnelExpiry, credentials, activeNodeVrf, adminIP]);

  return { keepaliveRef };
}
