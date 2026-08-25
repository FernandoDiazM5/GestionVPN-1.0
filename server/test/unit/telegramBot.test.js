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
  answerCallbackQuery: vi.fn().mockResolvedValue({ ok: true }),
  setCommands: vi.fn().mockResolvedValue({ ok: true }),
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
    expect(text).toContain('Joinpoint NOC');
    expect(text).toContain('Para vincular');
    expect(text).toContain('/link');
  });

  it('/help sin vinculación lista solo comandos básicos', async () => {
    mysqlMocks.query.mockResolvedValue([]);
    await bot.handleMessage({ chat: { id: 1 }, text: '/help' });
    const text = getReplyText();
    expect(text).toContain('Joinpoint NOC');
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
    expect(text).toContain('/activar');
    expect(text).toContain('/desactivar');
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
    expect(text).toContain('/estado');
    expect(text).toContain('/sitios');
    expect(text).toContain('/activar');
    expect(text).toContain('/misitio');
  });

  it('/estado sin acceso activo', async () => {
    sessionRepoMocks.getActiveByUser.mockResolvedValue(null);
    await bot.handleMessage({ chat: { id: 1 }, text: '/estado' });
    expect(getReplyText()).toContain('ningún sitio');
  });

  it('/status con sesión activa muestra VRF y expiración', async () => {
    sessionRepoMocks.getActiveByUser.mockResolvedValue({
      tunnel_id: 'tunnel-a',
      vrf_name: 'VRF-A',
      expires_at: Date.now() + 5 * 60 * 1000,
    });
    await bot.handleMessage({ chat: { id: 1 }, text: '/status' });
    const text = getReplyText();
    expect(text).toContain('Torre Norte');
    expect(text).toMatch(/Expira en: [45] min/);
  });

  it('/misitio muestra el sitio activo y el tiempo restante', async () => {
    sessionRepoMocks.getActiveByUser.mockResolvedValue({ tunnel_id: 'tunnel-a', vrf_name: 'VRF-A', expires_at: Date.now() + 8 * 60 * 1000 });
    await bot.handleMessage({ chat: { id: 1 }, text: '/misitio' });
    expect(getReplyText()).toContain('Torre Norte');
    expect(getReplyText()).toMatch(/Expira en: [78] min/);
  });

  it('/sitios OWNER → lista todos los sitios del workspace', async () => {
    await bot.handleMessage({ chat: { id: 1 }, text: '/sitios' });
    const text = getReplyText();
    expect(text).toContain('Torre Norte');
    expect(text).toContain('Torre Sur');
    expect(telegramMocks.sendMessage.mock.calls[0][0].replyMarkup.inline_keyboard).toHaveLength(3);
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
    expect(text).toContain('Torre Norte');
    expect(text).not.toContain('Torre Sur');
  });

  // Regresión: el `tunnel_id` en `tunnel_assignments` suele ser el `nombre_vrf`
  // (el modal de asignar usa `nombre_vrf || ppp_user`). El bot debe matchear
  // por ese campo además del `ppp_user`, igual que `routes/nodes/_shared.js`.
  it('/tuneles MEMBER → matchea asignación guardada como nombre_vrf (no solo ppp_user)', async () => {
    mysqlMocks.query.mockImplementation(async (sql, params) => {
      if (/notification_subscriptions/i.test(sql)) return [{ user_id: 'u1' }];
      if (/workspace_members/i.test(sql)) return [{ workspace_id: 'ws1', role: 'MEMBER' }];
      if (/nombre_vrf IN/i.test(sql) && /ppp_user IN/i.test(sql)) {
        // Simula el match dual: los params incluyen `VRF-HOUSENET` 2 veces
        // (una para cada IN). Si el código solo enviara params para ppp_user,
        // el placeholder de nombre_vrf quedaría sin valor y MySQL fallaría.
        expect(params).toEqual(['ws1', 'VRF-HOUSENET', 'VRF-HOUSENET']);
        return [{ ppp_user: 'housenet', nombre_vrf: 'VRF-HOUSENET', nombre_nodo: 'Casa' }];
      }
      return [];
    });
    assignmentRepoMocks.assignedTunnelIds.mockResolvedValue(['VRF-HOUSENET']);
    await bot.handleMessage({ chat: { id: 1 }, text: '/tuneles' });
    expect(getReplyText()).toContain('Casa');
  });

  it('/tuneles MEMBER sin asignaciones', async () => {
    mysqlMocks.query.mockImplementation(async (sql) => {
      if (/notification_subscriptions/i.test(sql)) return [{ user_id: 'u1' }];
      if (/workspace_members/i.test(sql)) return [{ workspace_id: 'ws1', role: 'MEMBER' }];
      return [];
    });
    assignmentRepoMocks.assignedTunnelIds.mockResolvedValue([]);
    await bot.handleMessage({ chat: { id: 1 }, text: '/tuneles' });
    expect(getReplyText()).toContain('No tienes sitios');
  });

  it('/activar VRF-X → activa directo vía tunnelService', async () => {
    tunnelServiceMocks.activateTunnel.mockResolvedValue({
      ok: true, vrf: 'VRF-A', mgmtIp: '10.13.250.20',
      sessionId: 's1', expiresAt: Date.now() + 30 * 60 * 1000, switched: false,
    });
    await bot.handleMessage({ chat: { id: 1 }, text: '/activar VRF-A' });
    expect(tunnelServiceMocks.activateTunnel).toHaveBeenCalledWith(
      expect.objectContaining({ targetVRF: 'VRF-A', leaseSource: 'TELEGRAM' })
    );
    // Replies: "⏳ Activando..." + "✅ Acceso abierto..."
    const last = telegramMocks.sendMessage.mock.calls.at(-1)[0].text;
    expect(last).toContain('Acceso abierto');
    expect(last).toContain('Torre Norte');
    expect(last).toContain('15 minutos');
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
    expect(text).toContain('Elige el sitio');
    expect(text).toMatch(/1\).*Torre Norte/);
    expect(text).toMatch(/2\).*Torre Sur/);
    expect(bot._pendingSelections.has(1)).toBe(true);
    expect(telegramMocks.sendMessage.mock.calls[0][0].replyMarkup.inline_keyboard).toHaveLength(3);
  });

  it('/activar no permite un sitio fuera de la asignación del usuario', async () => {
    mysqlMocks.query.mockImplementation(async (sql) => {
      if (/notification_subscriptions/i.test(sql)) return [{ user_id: 'u1' }];
      if (/workspace_members/i.test(sql)) return [{ workspace_id: 'ws1', role: 'MEMBER' }];
      if (/ppp_user IN/i.test(sql)) return [{ ppp_user: 'tunnel-a', nombre_vrf: 'VRF-A', nombre_nodo: 'Torre Norte' }];
      return [];
    });
    assignmentRepoMocks.assignedTunnelIds.mockResolvedValue(['tunnel-a']);
    await bot.handleMessage({ chat: { id: 1 }, text: '/activar VRF-B' });
    expect(tunnelServiceMocks.activateTunnel).not.toHaveBeenCalled();
    expect(telegramMocks.sendMessage.mock.calls.at(-1)[0].text).toContain('no está asignado');
  });

  it('botón de sitio activa la selección del usuario', async () => {
    await bot.handleMessage({ chat: { id: 1 }, text: '/sitios' });
    tunnelServiceMocks.activateTunnel.mockResolvedValue({ ok: true, vrf: 'VRF-B', expiresAt: Date.now() + 15 * 60 * 1000 });
    await bot.handleCallbackQuery({ id: 'cb-site', message: { chat: { id: 1 } }, data: 'site:2' });
    expect(telegramMocks.answerCallbackQuery).toHaveBeenCalledWith(expect.objectContaining({ callbackQueryId: 'cb-site' }));
    expect(tunnelServiceMocks.activateTunnel).toHaveBeenCalledWith(expect.objectContaining({ targetVRF: 'VRF-B', leaseSource: 'TELEGRAM' }));
    expect(telegramMocks.sendMessage.mock.calls.at(-1)[0].text).toContain('Torre Sur');
  });

  it('número plano con pending → activa ese índice', async () => {
    // Setup pending
    await bot.handleMessage({ chat: { id: 1 }, text: '/activar' });
    tunnelServiceMocks.activateTunnel.mockResolvedValue({
      ok: true, vrf: 'VRF-B', mgmtIp: '10.13.250.20',
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

  it('/desactivar solicita confirmación y el botón cierra el acceso', async () => {
    sessionRepoMocks.getActiveByUser.mockResolvedValue({ id: 's1', tunnel_id: 'tunnel-a' });
    tunnelServiceMocks.deactivateTunnel.mockResolvedValue({
      ok: true, hadSession: true, tunnelId: 'tunnel-a', vrf: 'VRF-A',
    });
    await bot.handleMessage({ chat: { id: 1 }, text: '/desactivar' });
    expect(tunnelServiceMocks.deactivateTunnel).not.toHaveBeenCalled();
    expect(telegramMocks.sendMessage.mock.calls.at(-1)[0].replyMarkup.inline_keyboard[0]).toHaveLength(2);
    await bot.handleCallbackQuery({ id: 'cb-close', message: { chat: { id: 1 } }, data: 'close:s1' });
    expect(tunnelServiceMocks.deactivateTunnel).toHaveBeenCalled();
    const last = telegramMocks.sendMessage.mock.calls.at(-1)[0].text;
    expect(last).toContain('Acceso cerrado');
  });

  it('/desactivar sin sesión → mensaje idempotente', async () => {
    sessionRepoMocks.getActiveByUser.mockResolvedValue(null);
    await bot.handleMessage({ chat: { id: 1 }, text: '/desactivar' });
    const last = telegramMocks.sendMessage.mock.calls.at(-1)[0].text;
    expect(last).toContain('ningún sitio');
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

describe('handleMessage — consultas del administrador', () => {
  beforeEach(() => {
    userRepoMocks.findById.mockResolvedValue({ id: 'admin-1', email: 'admin@example.com', name: 'Admin', is_platform_admin: 1 });
    mysqlMocks.query.mockImplementation(async (sql) => {
      if (/notification_subscriptions/i.test(sql)) return [{ user_id: 'admin-1' }];
      if (/ORDER BY u\.created_at DESC LIMIT 30/i.test(sql)) return [{ email: 'moderador@example.com', name: 'Moderador', disabled_at: null, workspace_name: 'Operaciones' }];
      if (/LOWER\(u\.email\)=\?/i.test(sql)) return [{ email: 'moderador@example.com', name: 'Moderador', disabled_at: null, workspace_name: 'Operaciones', member_count: 4, last_access_at: null }];
      return [];
    });
  });

  it('/help muestra los comandos administrativos sólo al administrador', async () => {
    await bot.handleMessage({ chat: { id: 1 }, text: '/help' });
    expect(getReplyText()).toContain('/moderadores');
    expect(getReplyText()).toContain('/moderador');
  });

  it('/moderadores entrega un resumen sin incluir credenciales', async () => {
    await bot.handleMessage({ chat: { id: 1 }, text: '/moderadores' });
    expect(getReplyText()).toContain('moderador@example.com');
    expect(getReplyText()).toContain('Operaciones');
    expect(getReplyText()).not.toContain('password');
  });

  it('/moderador consulta un moderador por correo', async () => {
    await bot.handleMessage({ chat: { id: 1 }, text: '/moderador moderador@example.com' });
    expect(getReplyText()).toContain('Detalle del moderador');
    expect(getReplyText()).toContain('Miembros: 4');
  });
});
