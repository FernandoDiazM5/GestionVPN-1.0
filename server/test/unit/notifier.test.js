// ============================================================
//  notifier.test.js — dispatch unificado de notificaciones (Q1)
//
//  Cubre la lógica de routing del notifier sin tocar BD ni red:
//   • paused → skip
//   • evento no en eventTypes → skip
//   • channel email + telegram → dispatcha a ambos
//   • mailer.sendGeneric returns delivered=true → status sent
//   • telegram.sendMessage returns ok=false → status failed
// ============================================================
const { stubModule } = require('../helpers/moduleMock');

const notifRepoMocks = stubModule(__dirname, '../../db/repos/notificationRepo', {
  getOrDefault: vi.fn(),
  log: vi.fn().mockResolvedValue(undefined),
});

const userRepoMocks = stubModule(__dirname, '../../db/repos/userRepo', {
  findById: vi.fn(),
});

const mailerMocks = stubModule(__dirname, '../../lib/mailer', {
  sendGeneric: vi.fn(),
});

const telegramMocks = stubModule(__dirname, '../../lib/telegram', {
  sendMessage: vi.fn(),
  isConfigured: vi.fn().mockReturnValue(true),
});

const notifier = require('../../lib/notifier');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('notifier.notify — routing', () => {
  it('skip si paused', async () => {
    notifRepoMocks.getOrDefault.mockResolvedValue({
      paused: true,
      event_types: ['TUNNEL_ACTIVATED'],
      channels: { email: true, telegram: true },
      telegram_chat_id: 'chat1',
    });
    const out = await notifier.notify({ userId: 'u1', event: 'TUNNEL_ACTIVATED', payload: {} });
    expect(out.skipped).toBe('usuario pausado');
    expect(mailerMocks.sendGeneric).not.toHaveBeenCalled();
    expect(telegramMocks.sendMessage).not.toHaveBeenCalled();
  });

  it('skip si evento no está en sub.event_types', async () => {
    notifRepoMocks.getOrDefault.mockResolvedValue({
      paused: false,
      event_types: ['TUNNEL_DEACTIVATED'],   // distinto al que dispara
      channels: { email: true, telegram: true },
      telegram_chat_id: 'chat1',
    });
    const out = await notifier.notify({ userId: 'u1', event: 'TUNNEL_ACTIVATED', payload: {} });
    expect(out.skipped).toBe('evento no suscrito');
  });

  it('dispatcha a email y telegram cuando ambos están habilitados', async () => {
    notifRepoMocks.getOrDefault.mockResolvedValue({
      paused: false,
      event_types: ['TUNNEL_ACTIVATED'],
      channels: { email: true, telegram: true },
      telegram_chat_id: 'chat1',
    });
    userRepoMocks.findById.mockResolvedValue({ id: 'u1', email: 'alice@example.com' });
    mailerMocks.sendGeneric.mockResolvedValue({ delivered: true });
    telegramMocks.sendMessage.mockResolvedValue({ ok: true });

    const out = await notifier.notify({
      userId: 'u1',
      event: 'TUNNEL_ACTIVATED',
      payload: { tunnelId: 'VRF-X', expiresAt: Date.now() + 60000 },
    });

    expect(mailerMocks.sendGeneric).toHaveBeenCalledTimes(1);
    expect(mailerMocks.sendGeneric.mock.calls[0][0].to).toBe('alice@example.com');
    expect(telegramMocks.sendMessage).toHaveBeenCalledTimes(1);
    expect(telegramMocks.sendMessage.mock.calls[0][0].chatId).toBe('chat1');
    expect(out.results.email.ok).toBe(true);
    expect(out.results.telegram.ok).toBe(true);
  });

  it('si email falla y telegram OK, ambos quedan auditados', async () => {
    notifRepoMocks.getOrDefault.mockResolvedValue({
      paused: false,
      event_types: ['SESSION_EXPIRED'],
      channels: { email: true, telegram: true },
      telegram_chat_id: 'chat1',
    });
    userRepoMocks.findById.mockResolvedValue({ id: 'u1', email: 'a@b.com' });
    mailerMocks.sendGeneric.mockResolvedValue({ delivered: false, error: 'SMTP unreachable' });
    telegramMocks.sendMessage.mockResolvedValue({ ok: true });

    await notifier.notify({ userId: 'u1', event: 'SESSION_EXPIRED', payload: { tunnelId: 'VRF-Y' } });

    expect(notifRepoMocks.log).toHaveBeenCalledTimes(2);
    const calls = notifRepoMocks.log.mock.calls.map(c => c[0]);
    expect(calls.find(c => c.channel === 'email').status).toBe('failed');
    expect(calls.find(c => c.channel === 'telegram').status).toBe('sent');
  });

  it('si solo telegram está habilitado, no llama al mailer', async () => {
    notifRepoMocks.getOrDefault.mockResolvedValue({
      paused: false,
      event_types: ['TUNNEL_DEACTIVATED'],
      channels: { email: false, telegram: true },
      telegram_chat_id: 'chat42',
    });
    telegramMocks.sendMessage.mockResolvedValue({ ok: true });

    await notifier.notify({ userId: 'u1', event: 'TUNNEL_DEACTIVATED', payload: { vrf: 'VRF-Z' } });

    expect(mailerMocks.sendGeneric).not.toHaveBeenCalled();
    expect(telegramMocks.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('telegram skipped (sin token configurado) se loguea como skipped, no failed', async () => {
    notifRepoMocks.getOrDefault.mockResolvedValue({
      paused: false,
      event_types: ['TUNNEL_ACTIVATED'],
      channels: { email: false, telegram: true },
      telegram_chat_id: 'chat1',
    });
    telegramMocks.sendMessage.mockResolvedValue({ ok: false, skipped: true });

    await notifier.notify({ userId: 'u1', event: 'TUNNEL_ACTIVATED', payload: {} });
    const logCall = notifRepoMocks.log.mock.calls.find(c => c[0].channel === 'telegram');
    expect(logCall[0].status).toBe('skipped');
  });
});

describe('notifier.buildMessage — templates', () => {
  it('TUNNEL_ACTIVATED incluye tunnel y expira', () => {
    const exp = Date.now() + 60000;
    const m = notifier.buildMessage('TUNNEL_ACTIVATED', { tunnelId: 'VRF-A', expiresAt: exp, ip: '1.2.3.4' });
    expect(m.subject).toContain('VRF-A');
    expect(m.html).toContain('VRF-A');
    expect(m.html).toContain('1.2.3.4');
  });

  it('SESSION_EXPIRED tiene texto característico', () => {
    const m = notifier.buildMessage('SESSION_EXPIRED', { tunnelId: 'VRF-B' });
    expect(m.html).toContain('caducó');
    expect(m.text).toContain('caducó');
  });

  it('evento desconocido tiene fallback genérico', () => {
    const m = notifier.buildMessage('UNKNOWN_EVENT', {});
    expect(m.subject).toContain('UNKNOWN_EVENT');
  });
});
