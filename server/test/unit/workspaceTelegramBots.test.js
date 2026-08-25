import { beforeEach, describe, expect, it, vi } from 'vitest';
const { stubModule } = require('../helpers/moduleMock');

stubModule(__dirname, '../../lib/workspaceIntegrationService', { listActiveTelegramBots: vi.fn().mockResolvedValue([]) });
const repo = stubModule(__dirname, '../../db/repos/notificationRepo', { confirmTelegramLink: vi.fn(), unlinkTelegram: vi.fn() });
const telegram = stubModule(__dirname, '../../lib/telegram', { sendMessage: vi.fn().mockResolvedValue({ ok: true }), setCommands: vi.fn().mockResolvedValue({ ok: true }) });
const mysql = stubModule(__dirname, '../../db/mysql', { query: vi.fn(), withTransaction: vi.fn() });
stubModule(__dirname, '../../db/repos/userRepo', { findById: vi.fn().mockResolvedValue({ id: 'u1', email: 'owner@example.com' }) });
stubModule(__dirname, '../../db/repos/sessionRepo', { getActiveByUser: vi.fn() });
stubModule(__dirname, '../../db/repos/assignmentRepo', { assignedTunnelIds: vi.fn() });
stubModule(__dirname, '../../lib/tunnelService', { activateTunnel: vi.fn(), deactivateTunnel: vi.fn() });
stubModule(__dirname, '../../db.service', { getAppSetting: vi.fn(), decryptPass: vi.fn(), getDb: vi.fn() });
const bots = require('../../lib/workspaceTelegramBots');

beforeEach(() => { vi.clearAllMocks(); telegram.sendMessage.mockResolvedValue({ ok: true }); });

describe('workspaceTelegramBots', () => {
  it('confirma el código limitado al workspace dueño del bot', async () => {
    repo.confirmTelegramLink.mockResolvedValue({ ok: true, userId: 'u1' });
    await bots.handleMessage({ workspaceId: 'ws-1', botToken: 'token' }, { chat: { id: 123 }, text: '/link ABC123' });
    expect(repo.confirmTelegramLink).toHaveBeenCalledWith({ code: 'ABC123', chatId: 123, workspaceId: 'ws-1', platformOnly: false, botFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(telegram.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ token: 'token', chatId: 123 }));
    expect(telegram.sendMessage.mock.calls[0][0].text).toContain('/activar');
  });

  it('no consulta la base con códigos inválidos', async () => {
    await bots.handleMessage({ workspaceId: 'ws-1', botToken: 'token' }, { chat: { id: 123 }, text: '/link incorrecto' });
    expect(repo.confirmTelegramLink).not.toHaveBeenCalled();
  });

  it('muestra los comandos operativos del bot vinculado', async () => {
    mysql.query.mockImplementation(async sql => /notification_subscriptions/i.test(sql) ? [{ user_id: 'u1' }] : []);
    await bots.handleMessage({ workspaceId: 'ws-1', botToken: 'token' }, { chat: { id: 123 }, text: '/help' });
    const text = telegram.sendMessage.mock.calls[0][0].text;
    expect(text).toContain('/status');
    expect(text).toContain('/tuneles');
    expect(text).toContain('/activar');
    expect(text).toContain('/desactivar');
  });
});
