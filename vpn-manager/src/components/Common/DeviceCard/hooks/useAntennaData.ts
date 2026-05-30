import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchWithTimeout } from '../../../../utils/fetchWithTimeout';
import type { SavedDevice, AntennaStats } from '../../../../types/devices';
import { API_BASE_URL } from '../../../../config';

export function useAntennaData(device: SavedDevice, isPreview?: boolean, compact?: boolean) {
  const [antennaStats, setAntennaStats] = useState<AntennaStats | null>(device.cachedStats ?? null);
  const [isLoadingAntenna, setIsLoadingAntenna] = useState(false);
  const [antennaError, setAntennaError] = useState('');
  const autoFetched = useRef(false);

  const handleLoadAntenna = useCallback(async () => {
    if (!device.sshUser || !device.sshPass) {
      setAntennaError('Sin credenciales SSH — edita el dispositivo para agregarlas');
      return;
    }
    setIsLoadingAntenna(true);
    setAntennaError('');
    try {
      const res = await fetchWithTimeout(`${API_BASE_URL}/api/device/antenna`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceIP: device.ip,
          deviceUser: device.sshUser,
          devicePass: device.sshPass,
          devicePort: device.sshPort ?? 22,
        }),
      }, 20_000);
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message ?? 'Error obteniendo stats');
      const s: AntennaStats = data.stats;
      setAntennaStats(s);
    } catch (err: unknown) {
      setAntennaError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setIsLoadingAntenna(false);
    }
  }, [device.ip, device.sshUser, device.sshPass, device.sshPort]);

  useEffect(() => {
    if (compact && !antennaStats && !autoFetched.current && device.sshUser && device.sshPass) {
      autoFetched.current = true;
      handleLoadAntenna();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compact]);

  return {
    antennaStats,
    isLoadingAntenna,
    antennaError,
    handleLoadAntenna,
    setAntennaStats,
  };
}
