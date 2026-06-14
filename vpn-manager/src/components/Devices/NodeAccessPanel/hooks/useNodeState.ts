import { useState, useRef } from 'react';
import { useVpn } from '../../../../context';

export function useNodeState() {
  const {
    nodes,
    setNodes,
    activeNodeVrf,
    tunnelExpiry,
    setTunnelExpiry,
    deactivateAllNodes,
    removeNodeFromState,
    isReady,
  } = useVpn();

  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(nodes.length > 0);
  const [errorMsg, setErrorMsg] = useState('');
  const [isRevoking, setIsRevoking] = useState(false);
  const [showRenewalWarn, setShowRenewalWarn] = useState(false);
  const prevRunningRef = useRef<Record<string, boolean>>({});
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  return {
    nodes,
    setNodes,
    activeNodeVrf,
    tunnelExpiry,
    setTunnelExpiry,
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
    showRenewalWarn,
    setShowRenewalWarn,
    prevRunningRef,
    pollingRef,
  };
}
