import { useState, useEffect } from 'react';
import { parseRouterUptime } from '../utils';
import type { VpnSecret, VpnStatus } from '../types';

interface UseVpnUptimeReturn {
  uptime: number;
  setUptime: (uptime: number) => void;
}

export function useVpnUptime(vpn: VpnSecret, status: VpnStatus): UseVpnUptimeReturn {
  const [uptime, setUptime] = useState(() =>
    vpn.running && vpn.uptime ? parseRouterUptime(vpn.uptime) : 0,
  );

  useEffect(() => {
    if (vpn.running && status !== 'running' && status !== 'activating') {
      setUptime(vpn.uptime ? parseRouterUptime(vpn.uptime) : 0);
    } else if (!vpn.running && status === 'running') {
      setUptime(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vpn.running, vpn.ip, vpn.uptime, status]);

  useEffect(() => {
    if (status !== 'running') return;
    const interval = setInterval(() => setUptime(prev => prev + 1), 1000);
    return () => clearInterval(interval);
  }, [status]);

  return { uptime, setUptime };
}
