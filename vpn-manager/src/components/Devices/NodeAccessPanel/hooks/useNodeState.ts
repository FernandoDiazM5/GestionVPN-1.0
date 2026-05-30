import { useState, useRef } from 'react';
import { useVpn, TUNNEL_TIMEOUT_MS } from '../../../../context';

export function useNodeState() {
  const {
    nodes,
    setNodes,
    activeNodeVrf,
    tunnelExpiry,
    setTunnelExpiry,
    adminIP,
    deactivateAllNodes,
    removeNodeFromState,
    isReady,
  } = useVpn();

  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(nodes.length > 0);
  const [errorMsg, setErrorMsg] = useState('');
  const [isRevoking, setIsRevoking] = useState(false);
  const [search, setSearch] = useState('');
  const [sortMode, setSortMode] = useState<'default' | 'connected' | 'disconnected'>('default');
  const [showRenewalWarn, setShowRenewalWarn] = useState(false);
  const prevRunningRef = useRef<Record<string, boolean>>({});
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  return {
    nodes,
    setNodes,
    activeNodeVrf,
    tunnelExpiry,
    setTunnelExpiry,
    adminIP,
    deactivateAllNodes,
    removeNodeFromState,
    isReady,
    isLoading,
    setIsLoading,
    hasLoaded,
    setHasLoaded,
    errorMsg,
    setErrorMsg,
    isRevoking,
    setIsRevoking,
    search,
    setSearch,
    sortMode,
    setSortMode,
    showRenewalWarn,
    setShowRenewalWarn,
    prevRunningRef,
    pollingRef,
  };
}
