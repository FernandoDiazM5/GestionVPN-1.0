import { del, get, post, put } from './sessionClient';

export type IntegrationProvider = 'BREVO' | 'GMAIL' | 'TELEGRAM' | 'GEMINI' | 'MIKROWISP' | 'FIREBASE';
export interface WorkspaceIntegration {
  provider: IntegrationProvider;
  configured: boolean;
  active: boolean;
  status: 'ACTIVE' | 'INVALID' | 'NOT_CONFIGURED';
  label: string | null;
  metadata: Record<string, string | number | boolean>;
  lastValidatedAt: number | null;
  updatedAt: number | null;
}
export type MikrowispCatalogType = 'ROUTERS';
export interface ExternalCatalogSummary { type: MikrowispCatalogType; label: string; count: number; lastSyncedAt: number | null }
export interface ExternalCatalogEntry { type: MikrowispCatalogType; externalId: string; name: string; metadata: Record<string, string>; lastSyncedAt: number }
export interface ExternalCatalog { type: MikrowispCatalogType; label: string; entries: ExternalCatalogEntry[] }
export type TelegramGroupProfile = 'CLIENT_TRACKING' | 'FIBER_ROUTES' | 'GENERAL';
export interface TelegramForumGroup { id: string; chatId: string | null; name: string | null; status: string; profileType: TelegramGroupProfile; capabilities: string[]; missingPermissions: string[]; linkedAt: number | null; createdAt: number }
export interface TelegramForumTopic { id: string; groupId: string; clientId: string; clientName: string; name: string; threadId: string | null; status: string; createdAt: number; updatedAt: number }
export interface TelegramForumParticipant { id: string | null; userId: string; name: string | null; email: string | null; role: string | null; telegramLinked: boolean; telegramUserId: string | null; status: 'NOT_INVITED' | 'INVITE_PENDING' | 'INVITE_EXPIRED' | 'PRESENT_UNAUTHORIZED' | 'ACTIVE' | 'REMOVED'; inviteLink: string | null; inviteExpiresAt: number | null; joinedAt: number | null; removedAt: number | null }
export interface IntegrationGuide { key: 'MIKROWISP'; title: string; version: string; fileName: string; fileSize: number; active: boolean; updatedAt: number }
export interface TelegramBulkPreview { totalClients: number; existing: number; pending: number; skipped: number }
export interface TelegramBulkJob { retryAt?: number | null; id: string; groupId: string; status: 'PENDING' | 'RUNNING' | 'PAUSED' | 'COMPLETED'; totalClients: number; existing: number; pending: number; created: number; skipped: number; failed: number; startedAt: number | null; finishedAt: number | null; createdAt: number; updatedAt: number }
export interface FiberRoute { id: string; groupId: string; topicId: string | null; code: string; name: string; zone: string; status: string; responsibleUserId: string; cableType: string | null; cableCapacity: number | null; originCoordinates: string | null; destinationCoordinates: string | null; closedAt: number | null; createdAt: number; updatedAt: number }
export interface FiberElement { id: string; routeId: string; sequence: number; type: string; name: string; location: string | null; coordinates: string | null; tray: string | null; port: string | null; inputCable: string | null; inputFiber: string | null; outputCable: string | null; outputFiber: string | null; fusionType: string | null; splitterRatio: string | null; reserveLength: string | null; notes: string | null; createdAt: number }
export interface FiberMeasurement { id: string; routeId: string; elementId: string | null; powerDbm: number; wavelengthNm: number | null; notes: string | null; measuredAt: number }
export interface FiberEvidence { id: string; routeId: string; elementId: string | null; type: string; description: string; telegramFileId: string | null; createdAt: number }
export interface FiberRouteDetail { route: FiberRoute; elements: FiberElement[]; measurements: FiberMeasurement[]; evidence: FiberEvidence[]; events: Array<{ type: string; detail: string | null; actorUserId: string; createdAt: number }> }

export const integrationsApi = {
  list: () => get<{ success: true; integrations: WorkspaceIntegration[] }>('/api/workspace/integrations'),
  save: (provider: IntegrationProvider, config: Record<string, string>) =>
    put<{ success: true; integration: WorkspaceIntegration }>(`/api/workspace/integrations/${provider}`, config),
  test: (provider: IntegrationProvider) =>
    post<{ success: true; integration: WorkspaceIntegration }>(`/api/workspace/integrations/${provider}/test`),
  remove: (provider: IntegrationProvider) =>
    del<{ success: true; message: string }>(`/api/workspace/integrations/${provider}`),
  listMikrowispCatalogs: () =>
    get<{ success: true; catalogs: ExternalCatalogSummary[] }>('/api/workspace/integrations/mikrowisp/catalogs'),
  syncMikrowispCatalog: (type: MikrowispCatalogType) =>
    post<{ success: true; catalog: ExternalCatalog }>(`/api/workspace/integrations/mikrowisp/catalogs/${type}/sync`, {}),
  listTelegramForums: () => get<{ success: true; groups: TelegramForumGroup[] }>('/api/workspace/integrations/mikrowisp/telegram-forums'),
  createTelegramForumLink: (profileType: TelegramGroupProfile = 'CLIENT_TRACKING') => post<{ success: true; link: { id: string; code: string; command: string; expiresAt: number; profileType: TelegramGroupProfile; capabilities: string[] } }>('/api/workspace/integrations/mikrowisp/telegram-forums/link-code', { profileType }),
  listTelegramForumTopics: (groupId: string) => get<{ success: true; topics: TelegramForumTopic[] }>(`/api/workspace/integrations/mikrowisp/telegram-forums/${groupId}/topics`),
  reconcileTelegramForum: (groupId: string) => post<{ success: true; group: TelegramForumGroup; deletedTopics: number }>(`/api/workspace/integrations/mikrowisp/telegram-forums/${groupId}/reconcile`, {}),
  previewTelegramForumTopic: (groupId: string, clientId: string) => post<{ success: true; preview: { client: { id: string; name: string }; topicName: string } }>(`/api/workspace/integrations/mikrowisp/telegram-forums/${groupId}/topics/preview`, { clientId }),
  createTelegramForumTopic: (groupId: string, clientId: string) => post<{ success: true; topic: TelegramForumTopic }>(`/api/workspace/integrations/mikrowisp/telegram-forums/${groupId}/topics`, { clientId }),
  changeTelegramForumTopic: (groupId: string, topicId: string, action: 'close' | 'reopen') => post<{ success: true; topic: TelegramForumTopic }>(`/api/workspace/integrations/mikrowisp/telegram-forums/${groupId}/topics/${topicId}/${action}`, {}),
  recreateTelegramForumTopic: (groupId: string, topicId: string) => post<{ success: true; topic: TelegramForumTopic }>(`/api/workspace/integrations/mikrowisp/telegram-forums/${groupId}/topics/${topicId}/recreate`, { confirm: true }),
  deleteTelegramForumTopic: (groupId: string, topicId: string) => post<{ success: true; topic: TelegramForumTopic }>(`/api/workspace/integrations/mikrowisp/telegram-forums/${groupId}/topics/${topicId}/delete`, { confirm: true }),
  listTelegramForumParticipants: (groupId: string) => get<{ success: true; participants: TelegramForumParticipant[] }>(`/api/workspace/integrations/mikrowisp/telegram-forums/${groupId}/participants`),
  inviteTelegramForumParticipant: (groupId: string, userId: string) => post<{ success: true; participant: TelegramForumParticipant }>(`/api/workspace/integrations/mikrowisp/telegram-forums/${groupId}/participants/${userId}/invite`, {}),
  removeTelegramForumParticipant: (groupId: string, userId: string) => post<{ success: true; participant: TelegramForumParticipant }>(`/api/workspace/integrations/mikrowisp/telegram-forums/${groupId}/participants/${userId}/remove`, { confirm: true }),
  reinstateTelegramForumParticipant: (groupId: string, userId: string) => post<{ success: true; participant: TelegramForumParticipant }>(`/api/workspace/integrations/mikrowisp/telegram-forums/${groupId}/participants/${userId}/reinstate`, { confirm: true }),
  importMikrowispClients: () => post<{ success: true; snapshot: { count: number } }>('/api/workspace/integrations/mikrowisp/clients/import', {}),
  previewBulkTopics: (groupId: string) => get<{ success: true; preview: TelegramBulkPreview }>(`/api/workspace/integrations/mikrowisp/telegram-forums/${groupId}/topics/bulk/preview`),
  latestBulkTopics: (groupId: string) => get<{ success: true; job: TelegramBulkJob | null }>(`/api/workspace/integrations/mikrowisp/telegram-forums/${groupId}/topics/bulk/latest`),
  startBulkTopics: (groupId: string) => post<{ success: true; job: TelegramBulkJob }>(`/api/workspace/integrations/mikrowisp/telegram-forums/${groupId}/topics/bulk`, { confirm: true }),
  getBulkTopics: (groupId: string, jobId: string) => get<{ success: true; job: TelegramBulkJob }>(`/api/workspace/integrations/mikrowisp/telegram-forums/${groupId}/topics/bulk/${jobId}`),
  pauseBulkTopics: (groupId: string, jobId: string) => post<{ success: true; job: TelegramBulkJob }>(`/api/workspace/integrations/mikrowisp/telegram-forums/${groupId}/topics/bulk/${jobId}/pause`, {}),
  resumeBulkTopics: (groupId: string, jobId: string) => post<{ success: true; job: TelegramBulkJob }>(`/api/workspace/integrations/mikrowisp/telegram-forums/${groupId}/topics/bulk/${jobId}/resume`, {}),
  listFiberRoutes: (groupId: string) => get<{ success: true; routes: FiberRoute[] }>(`/api/workspace/integrations/telegram-groups/${groupId}/fiber-routes`),
  createFiberRoute: (groupId: string, input: { code: string; name: string; zone: string; cableType?: string; cableCapacity?: number }) => post<{ success: true; route: FiberRoute }>(`/api/workspace/integrations/telegram-groups/${groupId}/fiber-routes`, input),
  getFiberRoute: (groupId: string, routeId: string) => get<{ success: true } & FiberRouteDetail>(`/api/workspace/integrations/telegram-groups/${groupId}/fiber-routes/${routeId}`),
  addFiberElement: (groupId: string, routeId: string, input: Record<string, string>) => post<{ success: true; element: FiberElement }>(`/api/workspace/integrations/telegram-groups/${groupId}/fiber-routes/${routeId}/elements`, input),
  addFiberMeasurement: (groupId: string, routeId: string, input: { powerDbm: number; wavelengthNm?: number; notes?: string }) => post<{ success: true; measurement: FiberMeasurement }>(`/api/workspace/integrations/telegram-groups/${groupId}/fiber-routes/${routeId}/measurements`, input),
  changeFiberRouteStatus: (groupId: string, routeId: string, status: string, reason?: string) => post<{ success: true; route: FiberRoute }>(`/api/workspace/integrations/telegram-groups/${groupId}/fiber-routes/${routeId}/status`, { status, ...(reason ? { reason } : {}) }),
  getMikrowispGuide: () => get<{ success: true; guide: IntegrationGuide | null }>('/api/workspace/integrations/mikrowisp/guide'),
};

export const platformIntegrationsApi = {
  list: () => get<{ success: true; integrations: WorkspaceIntegration[] }>('/api/admin/integrations'),
  save: (provider: IntegrationProvider, config: Record<string, string>) =>
    put<{ success: true; integration: WorkspaceIntegration }>(`/api/admin/integrations/${provider}`, config),
  test: (provider: IntegrationProvider) =>
    post<{ success: true; integration: WorkspaceIntegration }>(`/api/admin/integrations/${provider}/test`),
  remove: (provider: IntegrationProvider) =>
    del<{ success: true; message: string }>(`/api/admin/integrations/${provider}`),
};
