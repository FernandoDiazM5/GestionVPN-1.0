// ============================================================
//  telegramBot.test.js — dispatcher de comandos (M1)
//
//  No ejercitamos el long-polling (eso requiere fetch real a la API).
//  Sí cubrimos la lógica de routing: auth por chat_id, comandos sin
//  vinculación, formato de deep-links.
// ============================================================
const { stubModule } = require('../helpers/moduleMock');

const telegramMocks = stubModule(__dirname, '../../lib/telegram', {
  sendMessage: vi.fn().mockResolvedValue({ ok: true }),
  isConfigured: vi.fn().mockReturnValue(true),
});

const notifRepoMocks = stubModule(__dirname, '../../db/repos/notificationRepo', {
  confirmTelegramLink: vi.fn(),
  unlinkTelegram: vi.fn(),
});

const sessionRepoMocks = stubModule(__dirname, '../../db/repos/sessionRepo', {
  getActiveByUser: vi.fn(),
});

const userRepoMocks = stubModule(__dirname, '../../db/repos/userRepo', {
  findById: vi.fn(),
});

const assignmentRepoMocks = stubModule(__dirname, '../../db/repos/assignmentRepo', {
  assignedTunnelIds: vi.fn(),
});

const mysqlMocks = stubModule(__dirname, '../../db/mysql', {
  query: vi.fn(),
  withTransaction: vi.fn(),
});

const bot = require('../../lib/telegramBot');

beforeEach(() => {
  vi.clearAllMocks();
  telegramMocks.sendMessage.mockResolvedValue({ ok: true });
});

function getReplyText() {
  return telegramMocks.sendMessage.mock.calls[0]?.[0]?.text || '';
}

describe('handleMessage — sin auth', () => {
  it('ignora mensajes que no son comando', async () => {
    await bot.handleMessage({ chat: { id: 1 }, text: 'hola' });
    expect(telegramMocks.sendMessage).not.toHaveBeenCalled();
  });

  it('/start sin vinculación pide /link', async () => {
    mysqlMocks.query.mockResolvedValue([]);
    await bot.handleMessage({ chat: { id: 1 }, text: '/start' });
    const text = getReplyText();
    expect(text).toContain('Para vincular');
    expect(text).toContain('/link');
  });

  it('/help sin vinculación lista solo comandos básicos', async () => {
    mysqlMocks.query.mockResolvedValue([]);
    await bot.handleMessage({ chat: { id: 1 }, text: '/help' });
    const text = getReplyText();
    expect(text).toContain('/start');
    expect(text).toContain('/link');
    expect(text).not.toContain('/status'); // requiere user
    expect(text).not.toContain('/tuneles');
  });

  it('/link CODE formato inválido → mensaje de error', async () => {
    await bot.handleMessage({ chat: { id: 1 }, text: '/link bad-code' });
    expect(getReplyText()).toContain('Formato inválido');
    expect(notifRepoMocks.confirmTelegramLink).not.toHaveBeenCalled();
  });

  it('/link CODE válido pero código no existe → error del repo', async () => {
    notifRepoMocks.confirmTelegramLink.mockResolvedValue({ ok: false, error: 'código expirado' });
    await bot.handleMessage({ chat: { id: 1 }, text: '/link ABC123' });
    expect(getReplyText()).toContain('código expirado');
  });

  it('/link CODE OK vincula y saluda con email', async () => {
    notifRepoMocks.confirmTelegramLink.mockResolvedValue({ ok: true, userId: 'u1' });
    userRepoMocks.findById.mockResolvedValue({ id: 'u1', email: 'alice@example.com' });
    await bot.handleMessage({ chat: { id: 1 }, text: '/link ABCDEF' });
    const text = getReplyText();
    expect(text).toContain('vinculado');
    expect(text).toContain('alice@example.com');
  });

  it('comandos protegidos sin vinculación → rechazo', async () => {
    mysqlMocks.query.mockResolvedValue([]);
    await bot.handleMessage({ chat: { id: 1 }, text: '/status' });
    expect(getReplyText()).toContain('vinculado');
  });

  it('comando desconocido → sugiere /help', async () => {
    await bot.handleMessage({ chat: { id: 1 }, text: '/foo' });
    expect(getReplyText()).toContain('Comando desconocido');
    expect(getReplyText()).toContain('/help');
  });
});

describe('handleMessage — con auth', () => {
  beforeEach(() => {
    // Por defecto: chat 1 está vinculado a user u1
    mysqlMocks.query.mockImplementation(async (sql) => {
      if (/notification_subscriptions/i.test(sql)) return [{ user_id: 'u1' }];
      if (/workspace_members/i.test(sql)) return [{ workspace_id: 'ws1', role: 'OWNER' }];
      if (/FROM nodes/i.test(sql)) return [
        { ppp_user: 'tunnel-a', nombre_vrf: 'VRF-A', nombre_nodo: 'Torre Norte' },
        { ppp_user: 'tunnel-b', nombre_vrf: 'VRF-B', nombre_nodo: 'Torre Sur' },
      ];
      return [];
    });
    userRepoMocks.findById.mockResolvedValue({ id: 'u1', email: 'alice@example.com', name: 'Alice' });
  });

  it('/start vinculado → saluda por nombre', async () => {
    await bot.handleMessage({ chat: { id: 1 }, text: '/start' });
    expect(getReplyText()).toContain('Alice');
    expect(getReplyText()).toContain('vinculado');
  });

  it('/help vinculado → incluye comandos avanzados', async () => {
    await bot.handleMessage({ chat: { id: 1 }, text: '/help' });
    const text = getReplyText();
    expect(text).toContain('/status');
    expect(text).toContain('/tuneles');
    expect(text).toContain('/activar');
  });

  it('/status sin sesión activa', async () => {
    sessionRepoMocks.getActiveByUser.mockResolvedValue(null);
    await bot.handleMessage({ chat: { id: 1 }, text: '/status' });
    expect(getReplyText()).toContain('Sin túnel activo');
  });

  it('/status con sesión activa muestra VRF y expiración', async () => {
    sessionRepoMocks.getActiveByUser.mockResolvedValue({
      tunnel_id: 'tunnel-a',
      vrf_name: 'VRF-A',
      expires_at: Date.now() + 5 * 60 * 1000,
    });
    await bot.handleMessage({ chat: { id: 1 }, text: '/status' });
    const text = getReplyText();
    expect(text).toContain('VRF-A');
    expect(text).toContain('tunnel-a');
    expect(text).toMatch(/Expira en: [45] min/);
  });

  it('/tuneles OWNER → lista todos del workspace', async () => {
    await bot.handleMessage({ chat: { id: 1 }, text: '/tuneles' });
    const text = getReplyText();
    expect(text).toContain('VRF-A');
    expect(text).toContain('VRF-B');
    expect(text).toContain('Torre Norte');
    expect(text).toContain('/activar');
  });

  it('/tuneles MEMBER → solo asignados', async () => {
    mysqlMocks.query.mockImplementation(async (sql) => {
      if (/notification_subscriptions/i.test(sql)) return [{ user_id: 'u1' }];
      if (/workspace_members/i.test(sql)) return [{ workspace_id: 'ws1', role: 'MEMBER' }];
      if (/ppp_user IN/i.test(sql)) return [{ ppp_user: 'tunnel-a', nombre_vrf: 'VRF-A', nombre_nodo: 'Torre Norte' }];
      return [];
    });
    assignmentRepoMocks.assignedTunnelIds.mockResolvedValue(['tunnel-a']);
    await bot.handleMessage({ chat: { id: 1 }, text: '/tuneles' });
    const text = getReplyText();
    expect(text).toContain('VRF-A');
    expect(text).not.toContain('VRF-B');
  });

  it('/tuneles MEMBER sin asignaciones', async () => {
    mysqlMocks.query.mockImplementation(async (sql) => {
      if (/notification_subscriptions/i.test(sql)) return [{ user_id: 'u1' }];
      if (/workspace_members/i.test(sql)) return [{ workspace_id: 'ws1', role: 'MEMBER' }];
      return [];
    });
    assignmentRepoMocks.assignedTunnelIds.mockResolvedValue([]);
    await bot.handleMessage({ chat: { id: 1 }, text: '/tuneles' });
    expect(getReplyText()).toContain('No tienes túneles');
  });

  it('/activar VRF-X → deep-link con activate=VRF-X', async () => {
    process.env.APP_BASE_URL = 'https://panel.example.com/app/';
    await bot.handleMessage({ chat: { id: 1 }, text: '/activar VRF-A' });
    const text = getReplyText();
    expect(text).toContain('https://panel.example.com/app/?activate=VRF-A');
    expect(text).toContain('seguridad');
  });

  it('/activar sin argumento → muestra uso', async () => {
    await bot.handleMessage({ chat: { id: 1 }, text: '/activar' });
    expect(getReplyText()).toContain('Uso');
  });

  it('/desactivar → deep-link', async () => {
    process.env.APP_BASE_URL = 'https://panel.example.com/app/';
    await bot.handleMessage({ chat: { id: 1 }, text: '/desactivar' });
    expect(getReplyText()).toContain('deactivate=1');
  });

  it('/unlink → desvincula y avisa', async () => {
    await bot.handleMessage({ chat: { id: 1 }, text: '/unlink' });
    expect(notifRepoMocks.unlinkTelegram).toHaveBeenCalledWith('u1');
    expect(getReplyText()).toContain('desvinculado');
  });

  it('comando con @BotName se normaliza', async () => {
    await bot.handleMessage({ chat: { id: 1 }, text: '/start@MyVpnBot' });
    expect(telegramMocks.sendMessage).toHaveBeenCalled();
    expect(getReplyText()).toContain('Alice');
  });
});
