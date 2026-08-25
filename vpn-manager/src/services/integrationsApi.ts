import { del, get, post, put } from './sessionClient';

export type IntegrationProvider = 'BREVO' | 'GMAIL' | 'TELEGRAM' | 'GEMINI' | 'FIREBASE';
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

export const integrationsApi = {
  list: () => get<{ success: true; integrations: WorkspaceIntegration[] }>('/api/workspace/integrations'),
  save: (provider: IntegrationProvider, config: Record<string, string>) =>
    put<{ success: true; integration: WorkspaceIntegration }>(`/api/workspace/integrations/${provider}`, config),
  test: (provider: IntegrationProvider) =>
    post<{ success: true; integration: WorkspaceIntegration }>(`/api/workspace/integrations/${provider}/test`),
  remove: (provider: IntegrationProvider) =>
    del<{ success: true; message: string }>(`/api/workspace/integrations/${provider}`),
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
