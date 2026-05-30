import { useState, useRef } from 'react';
import type { WgPeer } from '../../../../types/api';

export function useWireGuardState() {
  const [wgPeers, setWgPeers] = useState<WgPeer[]>([]);
  const [loadingWg, setLoadingWg] = useState(false);
  const [wgError, setWgError] = useState<string | null>(null);
  const [showNuevoAdmin, setShowNuevoAdmin] = useState(false);
  const [peersExpanded, setPeersExpanded] = useState(false);
  const [peerColors, setPeerColors] = useState<Record<string, string>>({});
  const [colorPickerAddr, setColorPickerAddr] = useState<string | null>(null);
  const [editingPeerId, setEditingPeerId] = useState<string | null>(null);
  const [editingPeerName, setEditingPeerName] = useState('');
  const [savingPeerName, setSavingPeerName] = useState(false);
  const [copiedPeerId, setCopiedPeerId] = useState<string | null>(null);
  const wgLoadedRef = useRef(false);

  return {
    wgPeers,
    setWgPeers,
    loadingWg,
    setLoadingWg,
    wgError,
    setWgError,
    showNuevoAdmin,
    setShowNuevoAdmin,
    peersExpanded,
    setPeersExpanded,
    peerColors,
    setPeerColors,
    colorPickerAddr,
    setColorPickerAddr,
    editingPeerId,
    setEditingPeerId,
    editingPeerName,
    setEditingPeerName,
    savingPeerName,
    setSavingPeerName,
    copiedPeerId,
    setCopiedPeerId,
    wgLoadedRef,
  };
}
