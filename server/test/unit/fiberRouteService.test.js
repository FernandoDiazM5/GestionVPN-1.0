import { beforeEach, describe, expect, it, vi } from 'vitest';
const { stubModule } = require('../helpers/moduleMock');
const query = vi.fn();
const txQuery = vi.fn();
const integrations = { getSecret: vi.fn() };
const telegram = { createForumTopic: vi.fn(), deleteForumTopic: vi.fn() };
const forums = { requireCapability: vi.fn(), clean: (value, max = 255) => String(value || '').trim().slice(0, max) };
stubModule(__dirname, '../../db/mysql', { query, withTransaction: vi.fn(async callback => callback({ query: txQuery })) });
stubModule(__dirname, '../../lib/workspaceIntegrationService', integrations);
stubModule(__dirname, '../../lib/telegramForumService', forums);
stubModule(__dirname, '../../lib/telegram', telegram);
const service = require('../../lib/fiberRouteService');

describe('fiberRouteService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    query.mockResolvedValue([{ id: 'g-1', workspace_id: 'ws-1', telegram_chat_id: '-1001', status: 'ACTIVE' }]);
    integrations.getSecret.mockResolvedValue({ botToken: '123:token' });
    telegram.createForumTopic.mockResolvedValue({ ok: true, result: { message_thread_id: 77 } });
  });

  it('crea una ruta estructurada y su tema canónico en una transacción', async () => {
    const route = await service.createRoute('ws-1', 'u-1', 'g-1', { code: 'rf-24', name: 'Central', zone: 'San Martín', cableType: 'ADSS', cableCapacity: 48 });
    expect(route).toMatchObject({ groupId: 'g-1', code: 'RF-24', name: 'Central', zone: 'San Martín', status: 'DRAFT' });
    expect(telegram.createForumTopic).toHaveBeenCalledWith(expect.objectContaining({ chatId: '-1001', name: 'RF-24 · Central → San Martín' }));
    expect(txQuery).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO fiber_routes'), expect.arrayContaining(['RF-24', 'Central', 'San Martín']));
    expect(txQuery).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO fiber_route_events'), expect.any(Array));
  });
});
