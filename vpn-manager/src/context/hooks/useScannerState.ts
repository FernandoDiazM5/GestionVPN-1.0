import { useState } from 'react';
import type { VpnSecret } from '../../store/db';

export function useScannerState() {
  const [scannedSecrets, setScannedSecrets] = useState<VpnSecret[]>([]);
  const [hasScanned, setHasScanned] = useState(false);

  return {
    scannedSecrets,
    setScannedSecrets,
    hasScanned,
    setHasScanned,
  };
}
