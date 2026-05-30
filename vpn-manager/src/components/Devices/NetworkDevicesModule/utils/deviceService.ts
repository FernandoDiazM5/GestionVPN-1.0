import { apiFetch } from '../../../../utils/apiClient';
import type { SavedDevice, AntennaStats } from '../../../../types/devices';

export async function fetchDeviceStats(device: SavedDevice): Promise<AntennaStats | null> {
  try {
    const res = await apiFetch('/api/device/antenna', {
      method: 'POST',
      body: JSON.stringify({
        deviceId: device.id,
        deviceIP: device.ip,
        deviceUser: device.sshUser,
        devicePass: device.sshPass,
        devicePort: device.sshPort ?? 22,
      }),
    });
    const data = await res.json();
    return data.success ? data.stats : null;
  } catch {
    return null;
  }
}

export async function testDeviceConnection(device: SavedDevice): Promise<boolean> {
  try {
    const res = await apiFetch('/api/device/ping', {
      method: 'POST',
      body: JSON.stringify({ ip: device.ip }),
    });
    const data = await res.json();
    return data.success;
  } catch {
    return false;
  }
}

export async function getDeviceInfo(deviceId: string): Promise<SavedDevice | null> {
  try {
    const res = await apiFetch(`/api/device/${deviceId}`);
    const data = await res.json();
    return data.success ? data.device : null;
  } catch {
    return null;
  }
}
