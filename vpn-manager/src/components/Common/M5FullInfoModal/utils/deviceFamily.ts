import type { ScannedDevice, SavedDevice } from '../../../../types/devices';

export function detectFamily(dev: ScannedDevice | SavedDevice): 'ac' | 'm5' | 'unknown' {
  const model = (dev.cachedStats?.deviceModel ?? dev.model ?? '').toUpperCase();
  const fw = (dev.cachedStats?.fwPrefix ?? '').toUpperCase();
  if (/\bAC\b|5AC|AC\d|ACGEN/.test(model) || fw === 'XC') return 'ac';
  if (/M[235679]\b|M900/.test(model) || fw === 'XW' || fw === 'XM') return 'm5';
  return 'unknown';
}
