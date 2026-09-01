import { get, post } from './sessionClient';
import type { ManagementSupernetPreview } from '@gestionvpn/contracts';

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
  vpsWireguard: {
    status: 'ACTIVE' | 'DEGRADED' | 'NOT_CONFIGURED';
    readOnly: true;
    interface: string;
    toolsAvailable: boolean;
    interfacePresent: boolean;
    addresses: string[];
    listenPort: number | null;
    publicKey: string | null;
    routes: string[];
    inspectedAt: number;
  };
  wireguardAgent: null | {
    requestId: string;
    operation: string;
    status: string;
    message: string;
    publicKey: string | null;
    backupId: string;
    completedAt: number | null;
  };
  wireguardDesired: VpsWireguardDraft | null;
  coreFirewallLockedAt?: number | null;
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

export interface ProvisionStep {
  name: string;
  status: 'CREATED' | 'EXISTS' | 'FAILED';
}

export interface ProvisionRun {
  id: string;
  operation_type: 'PREPARE_NEW';
  status: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'BLOCKED';
  actor_email?: string | null;
  target_host?: string | null;
  target_identity?: string | null;
  target_version?: string | null;
  target_model?: string | null;
  network_supernet?: string | null;
  error_code?: string | null;
  error_message?: string | null;
  started_at: number;
  finished_at?: number | null;
  steps: ProvisionStep[];
}

export interface VpsWireguardDraft {
  interface: string;
  address: string;
  localListenPort: number;
  mtu: number;
  corePublicKey: string;
  coreEndpointHost: string;
  coreEndpointPort: number;
  allowedIps: string[];
  persistentKeepalive: number;
}

export interface VpsWireguardPreview {
  valid: boolean;
  canApply: false;
  readOnly: true;
  blockers: string[];
  warnings: string[];
  conflicts: Array<{ allowedIp: string; source: string; name: string; cidr: string }>;
  desired: Record<string, unknown>;
  changes: Array<{ field: string; value: unknown }>;
  actions: string[];
}

export interface CoreVpsPeerPreview {
  valid: boolean;
  canSync: boolean;
  blockers: string[];
  changes: Array<{ field: string; action: string }>;
  interface?: string;
  corePublicKey?: string | null;
  listenPort?: number | null;
  expectedAllowed?: string[];
  peerPresent?: boolean;
  peerHandshake?: string | null;
  actions: string[];
}

export interface WireguardHistoryEvent {
  id: string;
  action: string;
  outcome: 'SUCCESS' | 'FAILED';
  reason?: string | null;
  actorEmail?: string | null;
  createdAt: number;
  detail: Record<string, unknown>;
}

export interface CoreFirewallPreview {
  valid: boolean;
  canApply: boolean;
  blockers: string[];
  publicEndpoint: string;
  tunnelHost: string;
  localNetworks: string[];
  allowedNetworks: string[];
  preserves: string[];
  actions: string[];
}

export const coreServerApi = {
  status: () => get<CoreStatusResponse>('/api/admin/core-server/status'),
  health: () => post<{ success: true; health: CoreHealth }>('/api/admin/core-server/health'),
  preview: () => get<{ success: true; preview: ProvisionPreview; confirmation: string }>('/api/admin/core-server/provision-preview'),
  provision: (confirmation: string) => post<{ success: true; result: { health: CoreHealth; steps: ProvisionStep[]; runId: string } }>('/api/admin/core-server/provision', { confirmation }),
  history: () => get<{ success: true; runs: ProvisionRun[] }>('/api/admin/core-server/provision-history'),
  backupNow: () => post<{ success: true; result: { sent?: boolean; filenames?: string[]; skipped?: boolean } }>('/api/admin/core-server/backup-now'),
  managementSupernetPreview: (cidr: string) => get<{ success: true; preview: ManagementSupernetPreview }>(
    `/api/settings/management-supernet-preview?cidr=${encodeURIComponent(cidr)}`,
  ),
  wireguardPreview: (draft: VpsWireguardDraft) => post<{ success: true; preview: VpsWireguardPreview }>(
    '/api/admin/core-server/wireguard-preview', draft,
  ),
  wireguardApply: (draft: VpsWireguardDraft, confirmation: string) => post<{ success: true; request: { requestId: string; status: string } }>(
    '/api/admin/core-server/wireguard-apply', { ...draft, confirmation },
  ),
  wireguardRollback: (confirmation: string) => post<{ success: true; request: { requestId: string; status: string } }>(
    '/api/admin/core-server/wireguard-rollback', { confirmation },
  ),
  wireguardRotate: (confirmation: string) => post<{ success: true; request: { requestId: string; status: string } }>(
    '/api/admin/core-server/wireguard-rotate', { confirmation },
  ),
  wireguardCorePreview: () => get<{ success: true; preview: CoreVpsPeerPreview; confirmation: string }>(
    '/api/admin/core-server/wireguard-core-preview',
  ),
  wireguardCoreSync: (confirmation: string) => post<{ success: true; result: { changed: boolean; interface: string; allowedAddresses: string[] } }>(
    '/api/admin/core-server/wireguard-core-sync', { confirmation },
  ),
  wireguardHistory: () => get<{ success: true; events: WireguardHistoryEvent[] }>(
    '/api/admin/core-server/wireguard-history',
  ),
  firewallLockdownPreview: (localNetworks: string[]) => post<{ success: true; preview: CoreFirewallPreview; confirmation: string }>(
    '/api/admin/core-server/firewall-lockdown-preview', { localNetworks },
  ),
  firewallLockdown: (localNetworks: string[], confirmation: string) => post<{ success: true; result: { applied: true; tunnelHost: string; allowedNetworks: string[]; preserves: string[] } }>(
    '/api/admin/core-server/firewall-lockdown', { localNetworks, confirmation },
  ),
};
