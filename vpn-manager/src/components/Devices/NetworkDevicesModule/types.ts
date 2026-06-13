import type { ReactNode } from 'react';
import type { ScannedDevice, SavedDevice, AntennaStats } from '../../../types/devices';
import type { NodeInfo } from '../../../types/api';

export interface ColumnDef {
  key: string;
  label: string;
  width: string;
  defaultVisible: boolean;
  requiresStats: boolean;
  render: (dev: ScannedDevice) => ReactNode;
}

export type SshAuthStatus = 'pending' | 'success' | 'failed';

export interface AddDeviceModalProps {
  device: ScannedDevice;
  node: NodeInfo;
  existing?: Pick<SavedDevice, 'sshUser' | 'sshPass' | 'sshPort' | 'routerPort'>;
  onSave: (d: SavedDevice) => void;
  onClose: () => void;
}

export interface ScanCred {
  user: string;
  pass: string;
}

export interface DeviceStatusPanelProps {
  dev: ScannedDevice;
  onRefresh?: (stats: AntennaStats) => void;
}

export interface ColumnPickerProps {
  visibleCols: string[];
  onChange: (cols: string[]) => void;
}

export interface RawBlockProps {
  title: string;
  content: string | null | undefined;
  icon?: React.ReactNode;
}

export interface ScanState {
  phase: 'idle' | 'discovering' | 'authenticating' | 'done';
  current: number;
  total: number;
}
