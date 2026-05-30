import type { SavedDevice } from '../../../types/devices';

export interface NodeGroup {
  nodeId: string;
  nodeName: string;
  aps: SavedDevice[];
  stas: SavedDevice[];
}

export interface CpeDetailTarget {
  mac: string;
  apId: string;
  ip: string;
  sshPort: number;
  sshUser: string;
  sshPass: string;
}

export interface PollResult {
  id: string;
  online: boolean;
  error: string | null;
  polledAt: number;
  stations: Array<{
    mac: string;
    ip: string;
    signal: number;
    rxRate: number;
    txRate: number;
    ccq: number;
  }>;
  signal: number;
  txRate: number;
  ccq: number;
  cpu: number;
  ram: number;
  uptime: number;
}
