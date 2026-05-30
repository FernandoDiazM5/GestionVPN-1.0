import { useState } from 'react';
import { apiFetch } from '../../../../utils/apiClient';
import { API_BASE_URL } from '../../../../config';
import type { NodeInfo } from '../../../../types/api';

export function useWireGuardPeer(node: NodeInfo, addLog: (msg: string) => void) {
  const [showWgPeerForm, setShowWgPeerForm] = useState(false);
  const [wgPeerKey, setWgPeerKey] = useState('');
  const [isSettingPeer, setIsSettingPeer] = useState(false);

  const handleSetWgPeer = async () => {
    if (!wgPeerKey.trim()) return;
    setIsSettingPeer(true);
    addLog('');
    try {
      addLog('Configurando peer CPE en el servidor...');
      const res = await apiFetch(`${API_BASE_URL}/api/node/wg/set-peer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pppUser: node.ppp_user, cpePublicKey: wgPeerKey.trim() }),
      });
      const data = await res.json() as { success?: boolean; message?: string; peerIP?: string };
      if (data.success) {
        addLog(`✓ Peer configurado — IP ${data.peerIP}`);
        setShowWgPeerForm(false);
        setWgPeerKey('');
        setTimeout(() => addLog(''), 3000);
      } else {
        addLog(`✗ Error: ${data.message}`);
      }
    } catch (e) {
      addLog(`✗ ${e instanceof Error ? e.message : 'Error'}`);
    } finally {
      setIsSettingPeer(false);
    }
  };

  return {
    showWgPeerForm,
    setShowWgPeerForm,
    wgPeerKey,
    setWgPeerKey,
    isSettingPeer,
    handleSetWgPeer,
  };
}
