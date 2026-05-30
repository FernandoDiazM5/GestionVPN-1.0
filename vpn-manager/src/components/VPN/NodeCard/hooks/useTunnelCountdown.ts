import { useState, useEffect } from 'react';
import { useVpn } from '../../../../context';
import { formatCountdown } from '../utils';

export function useTunnelCountdown(isThisNodeActive: boolean) {
  const { tunnelExpiry } = useVpn();
  const [countdown, setCountdown] = useState('');

  useEffect(() => {
    if (!isThisNodeActive || !tunnelExpiry) { setCountdown(''); return; }
    const tick = () => {
      const remaining = tunnelExpiry - Date.now();
      setCountdown(remaining > 0 ? formatCountdown(remaining) : '00:00');
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [isThisNodeActive, tunnelExpiry]);

  return countdown;
}
