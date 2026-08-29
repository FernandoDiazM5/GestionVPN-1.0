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
export interface TelegramForumGroup { id: string; chatId: string | null; name: string | null; status: string; missingPermissions: string[]; linkedAt: number | null; createdAt: number }
export interface TelegramForumTopic { id: string; groupId: string; clientId: string; clientName: string; name: string; threadId: string | null; status: string; createdAt: number; updatedAt: number }
export interface TelegramForumParticipant { id: string | null; userId: string; name: string | null; email: string | null; role: string | null; telegramLinked: boolean; telegramUserId: string | null; status: 'NOT_INVITED' | 'INVITE_PENDING' | 'INVITE_EXPIRED' | 'PRESENT_UNAUTHORIZED' | 'ACTIVE' | 'REMOVED'; inviteLink: string | null; inviteExpiresAt: number | null; joinedAt: number | null; removedAt: number | null }
export interface IntegrationGuide { key: 'MIKROWISP'; title: string; version: string; fileName: string; fileSize: number; active: boolean; updatedAt: number }

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
  createTelegramForumLink: () => post<{ success: true; link: { id: string; code: string; command: string; expiresAt: number } }>('/api/workspace/integrations/mikrowisp/telegram-forums/link-code', {}),
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
