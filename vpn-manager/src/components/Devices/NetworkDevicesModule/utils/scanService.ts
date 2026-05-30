import { apiFetch } from '../../../../utils/apiClient';
import type { ScannedDevice } from '../../../../types/devices';

export async function performScan(
  cidr: string
): Promise<ScannedDevice[]> {
  try {
    const res = await apiFetch('/api/scan', {
      method: 'POST',
      body: JSON.stringify({ cidr }),
    });
    const data = await res.json();
    return data.devices || [];
  } catch (err) {
    console.error('Scan failed:', err);
    return [];
  }
}

export async function performStreamScan(
  cidr: string,
  onProgress?: (discovered: number, scanned: number) => void
): Promise<ScannedDevice[]> {
  try {
    const res = await apiFetch('/api/scan/stream', {
      method: 'POST',
      body: JSON.stringify({ cidr }),
    });

    const reader = res.body?.getReader();
    if (!reader) return [];

    const devices: ScannedDevice[] = [];
    let discoveredCount = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const text = new TextDecoder().decode(value);
      const lines = text.split('\n');

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const data = JSON.parse(line);
          if (data.type === 'discovered') {
            discoveredCount++;
            onProgress?.(discoveredCount, devices.length);
          } else if (data.device) {
            devices.push(data.device);
          }
        } catch { /* silencioso */ }
      }
    }

    return devices;
  } catch (err) {
    console.error('Stream scan failed:', err);
    return [];
  }
}
