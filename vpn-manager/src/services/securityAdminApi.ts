import { apiJson, get, post } from './sessionClient';

export interface SecurityJail {
  name: string; actionable: boolean; currentlyFailed: number; totalFailed: number;
  currentlyBanned: number; totalBanned: number; banned: string[];
  banDetails?: Array<{target:string;blockedSince:number;expiresAt:number|null;attempts?:number;reason?:string;category?:string|null}>;
}
export interface SecurityStatus { success: true; jails: SecurityJail[]; trusted: string[]; trustedMetadata: Array<Record<string, unknown>>; currentIp:string; attemptHistory?: { since:number|null; until:number|null } }
export interface LockedAccount {
  user_id:string; email:string; name:string; workspace_name?:string|null;
  failures_15m:number; failures_24h:number; locked_until:number; lock_reason:string;
  locked_at?:number|null; updated_at?:number|null; last_failure_at?:number|null; last_failure_ip?:string|null;
  ip_globally_blocked?:boolean|null;
}
export interface WebObservationSource {
  sourceIp:string; authFailures24h:number; identities24h:number; unknownIdentities24h:number;
  rateLimited10m:number; notFound5m:number; distinctRoutes5m:number; sensitive10m:number;
  hostileSensitive10m?:number; distinctSensitiveRoutes10m?:number; authInterpretation?:string;
  firstSeen:number; lastSeen:number; events:number; recommendations:string[];
}
export interface WebObservation {
  success:true; mode:'OBSERVE_ONLY'; retentionDays:number; since:number; until:number; truncated:boolean;
  enforcement:{configuredMode:string;confirmed:boolean;armed:boolean;active:boolean;rolloutPercent:number;indefiniteConfirmed:boolean;
    indefiniteActive:boolean;jail:string;authJail?:string;scan6hJail?:string;scan24hJail?:string;
    sensitiveJail?:string;indefiniteJail:string;
    status:'OBSERVE_ONLY'|'ARMED_NO_ROLLOUT'|'TEMP_ENFORCEMENT'};
  actions:Array<{id:string;source_ip:string;recommendation:string;jail:string;
    status:'PENDING'|'APPLIED'|'FAILED';evidence?:Record<string,number|null>|null;
    expires_at?:number|null;created_at:number;updated_at:number}>;
  sources:WebObservationSource[]; events:Array<{eventType:string;sourceIp:string;userId?:string|null;
    routeGroup?:string|null;method?:string|null;statusCode?:number|null;occurredAt:number;
    decision:string;actionId?:string|null;decidedAt?:number|null}>;
}
export interface SecurityMutation {
  target: string; jail?: string; duration?: '15m'|'1h'|'6h'|'24h'|'7d'|'indefinite';
  category: 'FALSE_POSITIVE'|'ADMIN_ACCESS'|'MAINTENANCE'|'SECURITY_TEST'|'OTHER';
  reason: string; stepUpToken: string; confirmIndefinite?: boolean; confirmNetworkTrust?:boolean;
}

export const securityAdminApi = {
  status: () => get<SecurityStatus>('/api/admin/security/status'),
  history: (target?: string) => get<{ success:true; history:Array<Record<string, unknown>> }>(
    `/api/admin/security/history${target ? `?target=${encodeURIComponent(target)}` : ''}`),
  attempts: (target?: string) => get<{ success:true; attempts:Array<Record<string, unknown>>; total:number; historySince:number|null; historyUntil:number|null; truncated:boolean }>(
    `/api/admin/security/attempts${target ? `?target=${encodeURIComponent(target)}` : ''}`),
  webObservation: (target?:string) => get<WebObservation>(
    `/api/admin/security/web-observation${target ? `?target=${encodeURIComponent(target)}` : ''}`),
  stepUpPassword: (password: string) => post<{success:true;stepUpToken:string;expiresAt:number}>(
    '/api/admin/security/step-up', { password }),
  stepUpGoogle: (firebaseIdToken: string) => post<{success:true;stepUpToken:string;expiresAt:number}>(
    '/api/admin/security/step-up', { firebaseIdToken }),
  ban: (data: SecurityMutation) => post('/api/admin/security/ban', data),
  unban: (data: SecurityMutation) => post('/api/admin/security/unban', data),
  makeIndefinite: (data: SecurityMutation) => post('/api/admin/security/make-indefinite', data),
  trust: (data: SecurityMutation) => post('/api/admin/security/trust', data),
  untrust: (data: SecurityMutation) => apiJson('/api/admin/security/trust', {
    method: 'DELETE', body: JSON.stringify(data),
  }),
  lockedAccounts: () => get<{success:true;accounts:LockedAccount[]}>('/api/admin/security/locked-accounts'),
  unlockAccount: (data: {userId:string;category:SecurityMutation['category'];reason:string;stepUpToken:string}) =>
    post('/api/admin/security/locked-accounts/unlock', data),
};
