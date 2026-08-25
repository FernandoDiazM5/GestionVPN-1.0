import { beforeEach, describe, expect, it, vi } from 'vitest';
const { stubModule } = require('../helpers/moduleMock');

stubModule(__dirname, '../../lib/workspaceIntegrationService', { listActiveTelegramBots: vi.fn().mockResolvedValue([]) });
const repo = stubModule(__dirname, '../../db/repos/notificationRepo', { confirmTelegramLink: vi.fn() });
const telegram = stubModule(__dirname, '../../lib/telegram', { sendMessage: vi.fn().mockResolvedValue({ ok: true }) });
const bots = require('../../lib/workspaceTelegramBots');

beforeEach(() => { vi.clearAllMocks(); telegram.sendMessage.mockResolvedValue({ ok: true }); });

describe('workspaceTelegramBots', () => {
  it('confirma el código limitado al workspace dueño del bot', async () => {
    repo.confirmTelegramLink.mockResolvedValue({ ok: true, userId: 'u1' });
    await bots.handleMessage({ workspaceId: 'ws-1', botToken: 'token' }, { chat: { id: 123 }, text: '/link ABC123' });
    expect(repo.confirmTelegramLink).toHaveBeenCalledWith({ code: 'ABC123', chatId: 123, workspaceId: 'ws-1', botFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(telegram.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ token: 'token', chatId: 123 }));
  });

  it('no consulta la base con códigos inválidos', async () => {
    await bots.handleMessage({ workspaceId: 'ws-1', botToken: 'token' }, { chat: { id: 123 }, text: '/link incorrecto' });
    expect(repo.confirmTelegramLink).not.toHaveBeenCalled();
  });
});
