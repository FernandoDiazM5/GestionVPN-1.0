import type { VpnSecret } from '../../../store/db';
import type { ActivateResponse, DeactivateResponse } from '../../../types/api';

export type { VpnSecret, ActivateResponse, DeactivateResponse };

export type VpnStatus = 'disabled' | 'activating' | 'running' | 'deleting';

export interface VpnCardProps {
  vpn: VpnSecret;
  rowIndex: number;
  onUpdate: (updated: VpnSecret) => void;
  onRemove: () => void;
}
