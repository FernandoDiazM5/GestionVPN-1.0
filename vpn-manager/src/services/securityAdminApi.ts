import { apiJson, get, post } from './sessionClient';

export interface SecurityJail {
  name: string; actionable: boolean; currentlyFailed: number; totalFailed: number;
  currentlyBanned: number; totalBanned: number; banned: string[];
  banDetails?: Array<{target:string;blockedSince:number;expiresAt:number|null;attempts?:number;reason?:string;category?:string|null}>;
}
export interface SecurityStatus { success: true; jails: SecurityJail[]; trusted: string[]; trustedMetadata: Array<Record<string, unknown>>; currentIp:string; attemptHistory?: { since:number|null; until:number|null } }
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
};
