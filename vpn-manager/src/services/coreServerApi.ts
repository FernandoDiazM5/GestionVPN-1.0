import { get, post } from './sessionClient';

export type CoreHealthStatus = 'HEALTHY' | 'DEGRADED' | 'UNREACHABLE' | 'INVALID_CREDENTIALS' | 'NOT_CONFIGURED';

export interface CoreHealth {
  configured: boolean;
  host?: string;
  status: CoreHealthStatus;
  apiOk: boolean;
  identity?: string;
  version?: string;
  model?: string;
  uptime?: string;
  cpuLoad?: number;
  freeMemory?: number;
  wanInterface?: string;
  internetOk?: boolean;
  vpnReady?: boolean;
  operationalObjects?: number;
  wireguard?: { total: number; management: number };
  sstp?: { enabled: boolean; port: number | null };
  vpsPeer?: { present: boolean; lastHandshake: string | null };
}

export interface BackupRun {
  id: string;
  trigger_type: 'scheduled' | 'manual';
  local_date: string;
  status: 'RUNNING' | 'SENT' | 'FAILED';
  identity_name?: string | null;
  backup_size_bytes?: number | null;
  rsc_size_bytes?: number | null;
  recipient_masked?: string | null;
  failure_code?: string | null;
  started_at: number;
  sent_at?: number | null;
}

export interface CoreStatusResponse {
  success: true;
  health: CoreHealth;
  backup: {
    enabled: boolean;
    time: string;
    timeZone: string;
    passwordConfigured: boolean;
    last: BackupRun | null;
  };
}

export interface ProvisionPreview {
  canProvision: boolean;
  blockers: string[];
  actions: string[];
  wanInterface?: string;
  summary?: CoreHealth;
}

export const coreServerApi = {
  status: () => get<CoreStatusResponse>('/api/admin/core-server/status'),
  health: () => post<{ success: true; health: CoreHealth }>('/api/admin/core-server/health'),
  preview: () => get<{ success: true; preview: ProvisionPreview; confirmation: string }>('/api/admin/core-server/provision-preview'),
  provision: (confirmation: string) => post<{ success: true; result: { health: CoreHealth } }>('/api/admin/core-server/provision', { confirmation }),
  backupNow: () => post<{ success: true; result: { sent?: boolean; filenames?: string[]; skipped?: boolean } }>('/api/admin/core-server/backup-now'),
};
