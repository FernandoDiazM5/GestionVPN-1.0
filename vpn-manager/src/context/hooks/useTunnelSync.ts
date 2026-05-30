import { useEffect, useRef } from 'react';
import { fetchWithTimeout } from '../../utils/fetchWithTimeout';
import { getApiToken } from '../../utils/apiClient';
import { API_BASE_URL } from '../../config';
import { BROADCAST_TUNNEL_SYNC } from '../constants';

export function useTunnelSync(
  isReady: boolean,
  isAuthenticated: boolean,
  activeNodeVrf: string | null,
  tunnelExpiry: number | null,
  setActiveNodeVrf: (vrf: string | null) => void,
  setTunnelExpiry: (expiry: number | null) => void
) {
  const tunnelChannelRef = useRef<BroadcastChannel | null>(null);

  // BroadcastChannel: sincroniza estado de túnel entre pestañas
  useEffect(() => {
    const ch = new BroadcastChannel(BROADCAST_TUNNEL_SYNC);
    tunnelChannelRef.current = ch;
    ch.onmessage = (e) => {
      const { type, activeNodeVrf: vrf, tunnelExpiry: expiry } = e.data ?? {};
      if (type === 'tunnel_update') {
        setActiveNodeVrf(vrf ?? null);
        setTunnelExpiry(expiry ?? null);
      }
    };
    return () => { ch.close(); tunnelChannelRef.current = null; };
  }, [setActiveNodeVrf, setTunnelExpiry]);

  // Emitir cambios de túnel a otras pestañas
  useEffect(() => {
    if (!isReady) return;
    tunnelChannelRef.current?.postMessage({
      type: 'tunnel_update',
      activeNodeVrf,
      tunnelExpiry,
    });
  }, [activeNodeVrf, tunnelExpiry, isReady]);

  // SSE: suscripción en tiempo real a cambios de túnel
  useEffect(() => {
    if (!isReady || !isAuthenticated) return;

    // Sync inicial desde el backend
    fetchWithTimeout(`${API_BASE_URL}/api/tunnel/status`, {}, 5_000)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.success) {
          setActiveNodeVrf(data.activeNodeVrf ?? null);
          setTunnelExpiry(data.tunnelExpiry ?? null);
        }
      })
      .catch(() => {});

    // Conexión SSE
    const token = getApiToken();
    const es = new EventSource(`${API_BASE_URL}/api/tunnel/events?token=${encodeURIComponent(token)}`);
    es.onmessage = (e) => {
      try {
        const { activeNodeVrf: vrf, tunnelExpiry: expiry } = JSON.parse(e.data);
        setActiveNodeVrf(vrf ?? null);
        setTunnelExpiry(expiry ?? null);
      } catch { /* ignorar mensajes malformados */ }
    };
    es.onerror = () => { /* reconexión automática */ };

    return () => es.close();
  }, [isReady, isAuthenticated, setActiveNodeVrf, setTunnelExpiry]);

  return { tunnelChannelRef };
}
