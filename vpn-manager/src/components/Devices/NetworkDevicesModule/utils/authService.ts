import { apiFetch } from '../../../../utils/apiClient';
import type { ScannedDevice } from '../../../../types/devices';

export async function runAuthPhase(
  devices: ScannedDevice[],
  commonCreds?: { user: string; pass: string },
  onProgress?: (success: number, total: number) => void
): Promise<ScannedDevice[]> {
  let successCount = 0;

  const updated = await Promise.all(
    devices.map(async (device) => {
      try {
        const creds = device.sshUser && device.sshPass
          ? { user: device.sshUser, pass: device.sshPass }
          : commonCreds;

        if (!creds) return device;

        const res = await apiFetch('/api/device/auth-test', {
          method: 'POST',
          body: JSON.stringify({
            ip: device.ip,
            user: creds.user,
            pass: creds.pass,
            port: device.sshPort ?? 22,
          }),
        });

        const data = await res.json();
        if (data.success) {
          successCount++;
          onProgress?.(successCount, devices.length);
          return {
            ...device,
            sshUser: creds.user,
            sshPass: creds.pass,
            sshPort: device.sshPort ?? 22,
          };
        }
      } catch { /* silencioso */ }

      onProgress?.(successCount, devices.length);
      return device;
    })
  );

  return updated;
}
