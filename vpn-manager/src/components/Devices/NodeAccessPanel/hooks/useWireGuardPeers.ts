import { useCallback, useEffect } from 'react';
import { apiFetch } from '../../../../utils/apiClient';
import { fetchWithTimeout } from '../../../../utils/fetchWithTimeout';
import { API_BASE_URL } from '../../../../config';
import type { WgPeer } from '../../../../types/api';

interface UseWireGuardPeersProps {
  credentials: { ip: string; user: string; pass: string } | null;
  wgLoadedRef: React.MutableRefObject<boolean>;
  setWgPeers: (peers: WgPeer[]) => void;
  setPeerColors: (colors: Record<string, string>) => void;
  setServerPublicKey: (key: string) => void;
  setServerListenPort: (port: string) => void;
  setServerEndpointIP: (ip: string) => void;
  setLoadingWg: (value: boolean) => void;
  setWgError: (error: string | null) => void;
  setColorPickerAddr: (addr: string | null) => void;
  setEditingPeerId: (id: string | null) => void;
  setEditingPeerName: (name: string) => void;
  setSavingPeerName: (value: boolean) => void;
  setCopiedPeerId: (id: string | null) => void;
  serverEndpointIP: string;
  serverListenPort: string;
  serverPublicKey: string;
  editingPeerName: string;
  savingPeerName: boolean;
}

export function useWireGuardPeers(props: UseWireGuardPeersProps) {
  const {
    credentials,
    wgLoadedRef,
    setWgPeers,
    setPeerColors,
    setServerPublicKey,
    setServerListenPort,
    setServerEndpointIP,
    setLoadingWg,
    setWgError,
    setColorPickerAddr,
    setEditingPeerId,
    setEditingPeerName,
    setSavingPeerName,
    setCopiedPeerId,
    serverEndpointIP,
    serverListenPort,
    serverPublicKey,
    editingPeerName,
    savingPeerName,
  } = props;

  const loadWgPeers = useCallback(async () => {
    if (!credentials) return;
    setLoadingWg(true);
    setWgError(null);
    try {
      const r = await fetchWithTimeout(`${API_BASE_URL}/api/wireguard/peers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip: credentials.ip, user: credentials.user, pass: credentials.pass }),
      }, 10_000);
      const d = await r.json();
      if (d.success) {
        setWgPeers(d.peers || []);
        if (d.serverPublicKey) setServerPublicKey(d.serverPublicKey);
        if (d.serverListenPort) setServerListenPort(String(d.serverListenPort));
        const publicIP = d.serverPublicIP || '';
        if (publicIP && publicIP !== serverEndpointIP) {
          setServerEndpointIP(publicIP);
          localStorage.setItem('wg_endpoint_ip', publicIP);
        } else if (!serverEndpointIP) {
          const saved = localStorage.getItem('wg_endpoint_ip') || '';
          if (saved) setServerEndpointIP(saved);
        }
      } else {
        setWgError(d.message || 'No se pudo conectar al router MikroTik.');
      }
    } catch (_) {
      setWgError('Sin conexión al router. Verifica que tu VPN WireGuard esté activa.');
    }
    setLoadingWg(false);
  }, [credentials, serverEndpointIP, setServerEndpointIP, setServerListenPort, setServerPublicKey, setWgError, setWgPeers, setLoadingWg]);

  // Cargar peers WireGuard y colores al montar
  useEffect(() => {
    if (credentials && !wgLoadedRef.current) {
      wgLoadedRef.current = true;
      loadWgPeers();
      apiFetch(`${API_BASE_URL}/api/wireguard/peer/colors`)
        .then(r => r.json())
        .then(d => {
          if (d.success) setPeerColors(d.colors || {});
        })
        .catch(() => {});
    }
  }, [credentials, loadWgPeers, setPeerColors, wgLoadedRef]);

  const savePeerColor = (peerAddress: string, color: string) => {
    setPeerColors(prev => ({ ...prev, [peerAddress]: color }));
    setColorPickerAddr(null);
    apiFetch(`${API_BASE_URL}/api/wireguard/peer/color/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ peerAddress, color }),
    }).catch(() => {});
  };

  const savePeerName = async (peer: WgPeer) => {
    if (!credentials || !editingPeerName.trim() || savingPeerName) return;
    setSavingPeerName(true);
    try {
      await fetchWithTimeout(`${API_BASE_URL}/api/wireguard/peer/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ip: credentials.ip,
          user: credentials.user,
          pass: credentials.pass,
          peerId: peer.id,
          newName: editingPeerName.trim(),
        }),
      }, 10_000);
      setWgPeers(prev =>
        prev.map(p =>
          p.id === peer.id ? { ...p, name: editingPeerName.trim() } : p
        )
      );
      setEditingPeerId(null);
    } catch (_) {
      /* silencioso */
    }
    setSavingPeerName(false);
  };

  const copyWgConfig = (peer: WgPeer) => {
    const endpoint = serverEndpointIP && serverListenPort
      ? `${serverEndpointIP}:${serverListenPort}`
      : `<ENDPOINT_SERVIDOR>`;
    const config = [
      '[Interface]',
      'PrivateKey = <TU_CLAVE_PRIVADA>',
      `Address = ${peer.allowedAddress}/32`,
      'DNS = 8.8.8.8',
      '',
      '[Peer]',
      `PublicKey = ${serverPublicKey || '<CLAVE_PUBLICA_SERVIDOR>'}`,
      'AllowedIPs = 0.0.0.0/0',
      `Endpoint = ${endpoint}`,
    ].join('\n');
    navigator.clipboard.writeText(config).then(() => {
      setCopiedPeerId(peer.id);
      setTimeout(() => setCopiedPeerId(null), 2500);
    });
  };

  return { loadWgPeers, savePeerColor, savePeerName, copyWgConfig };
}
