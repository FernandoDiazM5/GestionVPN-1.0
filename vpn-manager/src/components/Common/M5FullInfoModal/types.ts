import type { ScannedDevice, SavedDevice, AntennaStats } from '../../../types/devices';

export interface M5FullInfoModalProps {
  dev: ScannedDevice | SavedDevice;
  onClose: () => void;
}

export interface ModalSectionProps {
  s: AntennaStats;
  family?: 'ac' | 'm5' | 'unknown';
}
