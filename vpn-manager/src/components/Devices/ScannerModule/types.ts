import type { VpnSecret } from '../../../store/db';

export type { VpnSecret };

export interface ScannerState {
  isScanning: boolean;
  searchTerm: string;
  errorMsg: string;
  page: number;
}
