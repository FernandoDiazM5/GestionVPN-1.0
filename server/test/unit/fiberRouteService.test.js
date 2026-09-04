import { beforeEach, describe, expect, it, vi } from 'vitest';
const { stubModule } = require('../helpers/moduleMock');
const query = vi.fn();
const txQuery = vi.fn();
const integrations = { getSecret: vi.fn() };
const telegram = { createForumTopic: vi.fn(), deleteForumTopic: vi.fn() };
const forums = { ownerForTelegramUser: vi.fn(), requireCapability: vi.fn(), clean: (value, max = 255) => String(value || '').trim().slice(0, max) };
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

describe('registrar un tema de fibra existente', () => {
  const message = { chat: { id: -1001, type: 'supergroup' }, from: { id: 123 }, message_thread_id: 77 };
  const input = { workspaceId: 'ws-1', botToken: 'token', message };
  beforeEach(() => {
    vi.clearAllMocks();
    forums.ownerForTelegramUser.mockResolvedValue('u-1');
    forums.requireCapability.mockResolvedValue(undefined);
    query.mockResolvedValue([{ id: 'g-1' }]);
    txQuery.mockImplementation(async sql => sql.startsWith('SELECT id FROM telegram_forum_groups') ? [{ id: 'g-1' }] : sql.startsWith('SELECT') ? [] : { affectedRows: 1 });
  });
  it('genera código y vincula el mismo thread sin crear, renombrar ni borrar en Telegram', async () => {
    const result = await service.registerExistingRoute({ ...input, name: 'Troncal Norte', zone: 'Sector A' });
    expect(result).toMatchObject({ code: expect.stringMatching(/^RF-[A-F0-9]{12}$/), name: 'Troncal Norte', zone: 'Sector A' });
    expect(txQuery).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO telegram_forum_topics'), expect.arrayContaining(['77']));
    expect(telegram.createForumTopic).not.toHaveBeenCalled();
    expect(telegram.deleteForumTopic).not.toHaveBeenCalled();
    expect(integrations.getSecret).not.toHaveBeenCalled();
  });
  it('repetir el comando devuelve la ruta original sin duplicar', async () => {
    txQuery.mockImplementation(async sql => sql.startsWith('SELECT r.*') ? [{ id: 'r-1', code: 'RF-ORIGINAL', name: 'Ruta' }] : [{ id: 'g-1' }]);
    expect(await service.registerExistingRoute(input)).toMatchObject({ id: 'r-1', code: 'RF-ORIGINAL' });
    expect(txQuery.mock.calls.some(([sql]) => sql.startsWith('INSERT'))).toBe(false);
  });
  it('reutiliza el tema descubierto y su nombre', async () => {
    txQuery.mockImplementation(async sql => sql.startsWith('SELECT id FROM telegram_forum_groups') ? [{ id: 'g-1' }] : sql.startsWith('SELECT * FROM telegram_forum_topics') ? [{ id: 't-1', topic_name: 'Ruta antigua', status: 'UNREGISTERED' }] : sql.startsWith('SELECT') ? [] : { affectedRows: 1 });
    expect(await service.registerExistingRoute(input)).toMatchObject({ topicId: 't-1', name: 'Ruta antigua', zone: 'Por definir' });
    expect(txQuery.mock.calls.some(([sql]) => sql.startsWith('INSERT INTO telegram_forum_topics'))).toBe(false);
  });
  it('rechaza usuarios no vinculados y no escribe nada', async () => {
    forums.ownerForTelegramUser.mockResolvedValue(null);
    await expect(service.registerExistingRoute(input)).rejects.toMatchObject({ code: 'TELEGRAM_GROUP_OWNER_REQUIRED' });
    expect(txQuery).not.toHaveBeenCalled();
  });
  it('rechaza General y grupos con otro perfil', async () => {
    await expect(service.registerExistingRoute({ ...input, message: { ...message, message_thread_id: 1 } })).rejects.toMatchObject({ code: 'FIBER_TOPIC_REQUIRED' });
    forums.requireCapability.mockRejectedValue(new Error('Perfil inválido'));
    await expect(service.registerExistingRoute(input)).rejects.toThrow('Perfil inválido');
    expect(txQuery).not.toHaveBeenCalled();
  });
});
