import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchWithTimeout } from '../../../../utils/fetchWithTimeout';
import type { SavedDevice, AntennaStats } from '../../../../types/devices';
import { API_BASE_URL } from '../../../../config';

export function useAntennaData(device: SavedDevice, _isPreview?: boolean, compact?: boolean) {
  const [antennaStats, setAntennaStats] = useState<AntennaStats | null>(device.cachedStats ?? null);
  const [isLoadingAntenna, setIsLoadingAntenna] = useState(false);
  const [antennaError, setAntennaError] = useState('');
  const autoFetched = useRef(false);

  const handleLoadAntenna = useCallback(async () => {
    // Las credenciales SSH viven CIFRADAS en el backend (aps.clave_ssh_enc, §4.30).
    // Si el AP está guardado (tiene id) enviamos deviceId y el backend las resuelve
    // server-side (ownsApUuid + decrypt en device.routes H14) — NO dependemos de la
    // clave en el navegador. Solo exigimos credenciales locales cuando el equipo aún
    // no está guardado (flujo de escaneo, sin fila en `aps`).
    const hasServerCreds = !!device.id && (device.hasSshPass || !!device.sshUser);
    const hasBrowserCreds = !!device.sshUser && !!device.sshPass;
    if (!hasServerCreds && !hasBrowserCreds) {
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
          deviceId: device.id,   // ← el backend resuelve IP+credencial server-side
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
  }, [device.id, device.ip, device.sshUser, device.sshPass, device.hasSshPass, device.sshPort]);

  useEffect(() => {
    const canLoad = (!!device.id && (device.hasSshPass || !!device.sshUser)) || (!!device.sshUser && !!device.sshPass);
    if (compact && !antennaStats && !autoFetched.current && canLoad) {
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
