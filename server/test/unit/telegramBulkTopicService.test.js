import { beforeEach, describe, expect, it, vi } from 'vitest';
const { stubModule } = require('../helpers/moduleMock');
const query = vi.fn();
const integrations = { listMikrowispClients: vi.fn(), getSecret: vi.fn() };
const forums = { requireCapability: vi.fn(), clean: value => String(value).trim() };
stubModule(__dirname, '../../db/mysql', { query, withTransaction: vi.fn() });
stubModule(__dirname, '../../lib/workspaceIntegrationService', integrations);
stubModule(__dirname, '../../lib/telegramForumService', forums);
stubModule(__dirname, '../../lib/telegram', { createForumTopic: vi.fn() });
const service = require('../../lib/telegramBulkTopicService');

describe('telegramBulkTopicService', () => {
  beforeEach(() => { vi.clearAllMocks(); integrations.listMikrowispClients.mockResolvedValue([{ id: '1', name: 'Ana' }, { id: '2', name: 'Luis' }, { id: '3', name: 'Rosa' }]); });

  it('previsualiza con una sola lectura MikroWisp y omite temas existentes', async () => {
    query.mockResolvedValue([{ client_external_id: '2', status: 'ACTIVE' }]);
    const result = await service.preview('ws-1', 'g-1');
    expect(result).toEqual({ totalClients: 3, existing: 1, pending: 2, skipped: 0 });
    expect(integrations.listMikrowispClients).toHaveBeenCalledOnce();
    expect(forums.requireCapability).toHaveBeenCalledWith('g-1', 'CLIENT_TOPICS');
  });
});
