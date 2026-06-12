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

const tunnelServiceMocks = stubModule(__dirname, '../../lib/tunnelService', {
  activateTunnel: vi.fn(),
  deactivateTunnel: vi.fn(),
});

const dbServiceMocks = stubModule(__dirname, '../../db.service', {
  getAppSetting: vi.fn().mockResolvedValue('placeholder'),
  decryptPass: vi.fn().mockReturnValue('decrypted'),
  getDb: vi.fn(),
});

const bot = require('../../lib/telegramBot');

beforeEach(() => {
  vi.clearAllMocks();
  telegramMocks.sendMessage.mockResolvedValue({ ok: true });
  // pendingSelections es singleton del módulo; aislamos cada test.
  bot._pendingSelections.clear();
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

  it('/activar VRF-X → activa directo vía tunnelService', async () => {
    tunnelServiceMocks.activateTunnel.mockResolvedValue({
      ok: true, vrf: 'VRF-A', mgmtIp: '192.168.21.20',
      sessionId: 's1', expiresAt: Date.now() + 30 * 60 * 1000, switched: false,
    });
    await bot.handleMessage({ chat: { id: 1 }, text: '/activar VRF-A' });
    expect(tunnelServiceMocks.activateTunnel).toHaveBeenCalledWith(
      expect.objectContaining({ targetVRF: 'VRF-A' })
    );
    // Replies: "⏳ Activando..." + "✅ Acceso abierto..."
    const last = telegramMocks.sendMessage.mock.calls.at(-1)[0].text;
    expect(last).toContain('Acceso abierto');
    expect(last).toContain('VRF-A');
    expect(last).toContain('192.168.21.20');
  });

  it('/activar VRF-X con error del service → reporta', async () => {
    tunnelServiceMocks.activateTunnel.mockResolvedValue({
      ok: false, code: 409, message: 'IP de gestión no registrada',
    });
    await bot.handleMessage({ chat: { id: 1 }, text: '/activar VRF-A' });
    const last = telegramMocks.sendMessage.mock.calls.at(-1)[0].text;
    expect(last).toContain('No se pudo activar');
    expect(last).toContain('IP de gestión');
  });

  it('/activar sin argumento → lista numerada (pending)', async () => {
    await bot.handleMessage({ chat: { id: 1 }, text: '/activar' });
    const text = getReplyText();
    expect(text).toContain('Elige un túnel');
    expect(text).toMatch(/1\).*VRF-A/);
    expect(text).toMatch(/2\).*VRF-B/);
    expect(bot._pendingSelections.has(1)).toBe(true);
  });

  it('número plano con pending → activa ese índice', async () => {
    // Setup pending
    await bot.handleMessage({ chat: { id: 1 }, text: '/activar' });
    tunnelServiceMocks.activateTunnel.mockResolvedValue({
      ok: true, vrf: 'VRF-B', mgmtIp: '192.168.21.20',
      sessionId: 's1', expiresAt: Date.now() + 30 * 60 * 1000, switched: false,
    });
    await bot.handleMessage({ chat: { id: 1 }, text: '2' });
    expect(tunnelServiceMocks.activateTunnel).toHaveBeenCalledWith(
      expect.objectContaining({ targetVRF: 'VRF-B' })
    );
    expect(bot._pendingSelections.has(1)).toBe(false); // consumido
  });

  it('número fuera de rango → mensaje de error', async () => {
    await bot.handleMessage({ chat: { id: 1 }, text: '/activar' });
    await bot.handleMessage({ chat: { id: 1 }, text: '9' });
    const last = telegramMocks.sendMessage.mock.calls.at(-1)[0].text;
    expect(last).toContain('fuera de rango');
    expect(tunnelServiceMocks.activateTunnel).not.toHaveBeenCalled();
  });

  it('número plano SIN pending → se ignora (no es comando)', async () => {
    await bot.handleMessage({ chat: { id: 1 }, text: '5' });
    expect(telegramMocks.sendMessage).not.toHaveBeenCalled();
  });

  it('/cancelar limpia la selección pendiente', async () => {
    await bot.handleMessage({ chat: { id: 1 }, text: '/activar' });
    expect(bot._pendingSelections.has(1)).toBe(true);
    await bot.handleMessage({ chat: { id: 1 }, text: '/cancelar' });
    expect(bot._pendingSelections.has(1)).toBe(false);
    const last = telegramMocks.sendMessage.mock.calls.at(-1)[0].text;
    expect(last).toContain('cancelada');
  });

  it('/desactivar ejecuta directo vía tunnelService', async () => {
    tunnelServiceMocks.deactivateTunnel.mockResolvedValue({
      ok: true, hadSession: true, tunnelId: 'tunnel-a', vrf: 'VRF-A',
    });
    await bot.handleMessage({ chat: { id: 1 }, text: '/desactivar' });
    expect(tunnelServiceMocks.deactivateTunnel).toHaveBeenCalled();
    const last = telegramMocks.sendMessage.mock.calls.at(-1)[0].text;
    expect(last).toContain('desactivado');
  });

  it('/desactivar sin sesión → mensaje idempotente', async () => {
    tunnelServiceMocks.deactivateTunnel.mockResolvedValue({
      ok: true, hadSession: false,
    });
    await bot.handleMessage({ chat: { id: 1 }, text: '/desactivar' });
    const last = telegramMocks.sendMessage.mock.calls.at(-1)[0].text;
    expect(last).toContain('No tenías túnel activo');
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
