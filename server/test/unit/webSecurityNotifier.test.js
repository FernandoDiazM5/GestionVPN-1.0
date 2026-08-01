const { stubModule } = require('../helpers/moduleMock');

const repo = { listPlatformAdminsWithTelegram: vi.fn(), log: vi.fn() };
const telegram = { sendMessage: vi.fn() };
stubModule(__dirname, '../../db/repos/notificationRepo', repo);
stubModule(__dirname, '../../lib/telegram', telegram);
const notifier = require('../../lib/webSecurityNotifier');

describe('notificaciones de protección web automática', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repo.listPlatformAdminsWithTelegram.mockResolvedValue([]);
    repo.log.mockResolvedValue(undefined);
    telegram.sendMessage.mockResolvedValue({ ok: true });
  });

  it('notifica una sola vez por chat administrativo y registra el envío', async () => {
    repo.listPlatformAdminsWithTelegram.mockResolvedValue([
      { user_id: 'admin-1', telegram_chat_id: 'chat-1' },
      { user_id: 'admin-2', telegram_chat_id: 'chat-1' },
      { user_id: 'admin-3', telegram_chat_id: 'chat-2' },
    ]);
    const result = await notifier.notifyAutomaticAction({ status: 'APPLIED',
      sourceIp: '198.51.100.7', recommendation: 'TEMP_1H_ROUTE_SCAN', jail: 'gestionvpn-web-1h' });
    expect(result).toEqual({ recipients: 2, sent: 2 });
    expect(telegram.sendMessage).toHaveBeenCalledTimes(2);
    expect(repo.log).toHaveBeenCalledTimes(2);
  });

  it('escapa contenido y no rompe la protección si Telegram falla', async () => {
    repo.listPlatformAdminsWithTelegram.mockResolvedValue([
      { user_id: 'admin-1', telegram_chat_id: 'chat-1' },
    ]);
    telegram.sendMessage.mockRejectedValue(new Error('offline'));
    await expect(notifier.notifyAutomaticAction({ status: 'FAILED', sourceIp: '<ip>',
      recommendation: 'OTHER&TEST', jail: 'gestionvpn-web-1h' })).resolves.toEqual(
      expect.objectContaining({ recipients: 0, sent: 0 }));
  });
});
