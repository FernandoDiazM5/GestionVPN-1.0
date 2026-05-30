import { useEffect, useRef } from 'react';
import { TUNNEL_KEEPALIVE_CHECK_MS } from '../constants';

export function useTunnelTimeout(
  tunnelExpiry: number | null,
  deactivateAllNodes: () => Promise<void>
) {
  const timeoutRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (timeoutRef.current) {
      clearInterval(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (tunnelExpiry) {
      const checkExpiry = () => {
        if (Date.now() >= tunnelExpiry) {
          if (navigator.onLine) {
            deactivateAllNodes();
          } else {
            console.warn('[VPNContext] Túnel expirado pero no hay red — esperando reconexión...');
          }
        }
      };
      checkExpiry();
      timeoutRef.current = setInterval(checkExpiry, TUNNEL_KEEPALIVE_CHECK_MS);
    }
    return () => {
      if (timeoutRef.current) clearInterval(timeoutRef.current);
    };
  }, [tunnelExpiry, deactivateAllNodes]);

  return { timeoutRef };
}
