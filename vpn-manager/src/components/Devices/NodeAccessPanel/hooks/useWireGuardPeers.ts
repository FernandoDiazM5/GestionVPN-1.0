import { useState, useEffect, useCallback } from 'react';
import { fetchWithTimeout } from '../../../../utils/fetchWithTimeout';
import { PEER_COLOR_PALETTE } from '../constants';
import type { WgPeer } from '../types';

export function useWireGuardPeers() {
  const [peers, setPeers] = useState<WgPeer[]>([]);
  const [peerColors, setPeerColors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPeers = useCallback(async () => {
    try {
      const response = await fetchWithTimeout('/api/wireguard/peers', { method: 'GET' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setPeers(Array.isArray(data) ? data : []);
      setError(null);

      const colors: Record<string, string> = {};
      (Array.isArray(data) ? data : []).forEach((peer, idx) => {
        colors[peer.publicKey || peer.name] = PEER_COLOR_PALETTE[idx % PEER_COLOR_PALETTE.length];
      });
      setPeerColors(colors);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPeers();
  }, [fetchPeers]);

  const getPeerColor = useCallback((peerKey: string): string => {
    return peerColors[peerKey] || PEER_COLOR_PALETTE[0];
  }, [peerColors]);

  const refetch = useCallback(() => {
    fetchPeers();
  }, [fetchPeers]);

  return { peers, peerColors, loading, error, getPeerColor, refetch };
}
