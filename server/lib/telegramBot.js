// ============================================================
//  lib/telegramBot.js — bot Telegram interactivo (M1)
//
//  Reusa la vinculación de Q1: el chat_id se asocia a un user_id en
//  notification_subscriptions vía /link CODE. A partir de ahí, los
//  comandos saben quién está hablando.
//
//  Modelo: long-polling con getUpdates (sin HTTPS público, sin webhook).
//   • Loop con offset incremental — solo procesa updates nuevos.
//   • timeout 25s en cada getUpdates (Telegram aguanta hasta 50s).
//   • AbortController para shutdown limpio.
//
//  Comandos:
//   • /start            — bienvenida + estado de vinculación.
//   • /help             — lista de comandos.
//   • /link CODE        — confirma vinculación con el panel.
//   • /unlink           — desvincula el chat.
//   • /status           — sesión activa del usuario.
//   • /tuneles          — lista de túneles del workspace.
//   • /activar VRF-X    — devuelve deep-link al panel (no muta).
//   • /desactivar       — deep-link.
//
//  Seguridad:
//   • Los comandos de mutación NO ejecutan acciones directamente — solo
//     devuelven un deep-link `APP_BASE_URL?activate=VRF-X` (o similar).
//     El usuario hace click, abre el panel autenticado en su browser y
//     confirma allí. Esto evita exponer activate() a una cadena de auth
//     más débil (Telegram → bot → backend) que la sesión real.
// ============================================================
const log = require('./logger').child({ scope: 'telegram-bot' });
const telegram = require('./telegram');
const notificationRepo = require('../db/repos/notificationRepo');
const sessionRepo = require('../db/repos/sessionRepo');
const userRepo = require('../db/repos/userRepo');
const assignmentRepo = require('../db/repos/assignmentRepo');
const { query } = require('../db/mysql');

const POLL_TIMEOUT_SEC = 25;        // long-poll de Telegram
const RETRY_DELAY_MS = 2000;        // backoff tras fallo de red

let _running = false;
let _offset = 0;
let _abort = null;

// ── Auth ──────────────────────────────────────────────────────────
async function userForChat(chatId) {
  const rows = await query(
    'SELECT user_id FROM notification_subscriptions WHERE telegram_chat_id = ? LIMIT 1',
    [String(chatId)]
  );
  if (!rows.length) return null;
  return await userRepo.findById(rows[0].user_id).catch(() => null);
}

// ── Helpers ───────────────────────────────────────────────────────
function reply(chatId, text) {
  return telegram.sendMessage({ chatId, text, html: true });
}

function panelUrl(extraQuery = '') {
  const base = (process.env.APP_BASE_URL || 'http://localhost:5173/GestionVPN-1.0/').replace(/\/?$/, '/');
  return extraQuery ? `${base}?${extraQuery}` : base;
}

// ── Comandos ──────────────────────────────────────────────────────
async function cmdStart(chatId, user) {
  if (user) {
    return reply(chatId,
      `👋 Hola <b>${user.name || user.email}</b>\n\n` +
      `Tu chat ya está vinculado. Usa /help para ver los comandos.`
    );
  }
  return reply(chatId,
    '👋 <b>VPN Manager Bot</b>\n\n' +
    'Para vincular tu chat:\n' +
    '1) Abre el panel → <i>Ajustes → Notificaciones</i>\n' +
    '2) Toca <b>Vincular</b> — recibirás un código de 6 chars\n' +
    '3) Envíame: <code>/link CODE</code>\n\n' +
    `Panel: ${panelUrl()}`
  );
}

async function cmdHelp(chatId, user) {
  const lines = [
    '<b>Comandos</b>',
    '/start — bienvenida',
    '/link CODE — vincular este chat con tu cuenta',
    '/unlink — desvincular',
  ];
  if (user) {
    lines.push(
      '/status — tu sesión activa',
      '/tuneles — lista de túneles disponibles',
      '/activar &lt;VRF&gt; — abre el panel para activar',
      '/desactivar — abre el panel para desactivar',
    );
  }
  return reply(chatId, lines.join('\n'));
}

async function cmdLink(chatId, args) {
  const code = String(args[0] || '').trim().toUpperCase();
  if (!/^[A-F0-9]{6}$/.test(code)) {
    return reply(chatId, '❌ Formato inválido. Usa: <code>/link CODE</code> (6 chars hex).');
  }
  const r = await notificationRepo.confirmTelegramLink({ code, chatId });
  if (!r.ok) return reply(chatId, `❌ ${r.error}`);
  const user = await userRepo.findById(r.userId).catch(() => null);
  return reply(chatId,
    `✅ Chat vinculado a <b>${user?.email || r.userId}</b>.\n\n` +
    `Habilita el canal Telegram en el panel para recibir notificaciones.\n` +
    `Usa /help para ver comandos.`
  );
}

async function cmdUnlink(chatId, user) {
  if (!user) return reply(chatId, 'Este chat no está vinculado.');
  await notificationRepo.unlinkTelegram(user.id);
  return reply(chatId, '🔓 Chat desvinculado. Cuando quieras, /link CODE de nuevo.');
}

async function cmdStatus(chatId, user) {
  if (!user) return reply(chatId, '🔒 Tu chat no está vinculado. Envía /start.');
  // Necesitamos el workspace_id del usuario. Lo buscamos en workspace_members.
  const ws = await query(
    `SELECT workspace_id FROM workspace_members
      WHERE user_id = ? AND deleted_at IS NULL LIMIT 1`,
    [user.id]
  );
  if (!ws.length) return reply(chatId, 'Tu cuenta no tiene workspace asignado.');
  const wsId = ws[0].workspace_id;
  const sess = await sessionRepo.getActiveByUser(wsId, user.id);
  if (!sess) return reply(chatId, '🔒 Sin túnel activo.');
  const remaining = sess.expires_at ? Math.max(0, Math.round((sess.expires_at - Date.now()) / 60000)) : null;
  return reply(chatId,
    `🔓 <b>Túnel activo</b>\n` +
    `Túnel: <code>${sess.tunnel_id}</code>\n` +
    `VRF: <code>${sess.vrf_name}</code>\n` +
    (remaining != null ? `Expira en: ${remaining} min` : '')
  );
}

async function cmdTuneles(chatId, user) {
  if (!user) return reply(chatId, '🔒 Tu chat no está vinculado. Envía /start.');
  const ws = await query(
    `SELECT workspace_id, role FROM workspace_members
      WHERE user_id = ? AND deleted_at IS NULL LIMIT 1`,
    [user.id]
  );
  if (!ws.length) return reply(chatId, 'Tu cuenta no tiene workspace asignado.');
  const { workspace_id: wsId, role } = ws[0];

  // MEMBER: solo túneles asignados. OWNER/CO_MOD: todos los del workspace.
  let tunnels;
  if (role === 'MEMBER') {
    const ids = await assignmentRepo.assignedTunnelIds(wsId, user.id);
    if (!ids.length) return reply(chatId, 'No tienes túneles asignados.');
    tunnels = await query(
      `SELECT ppp_user, nombre_vrf, nombre_nodo FROM nodes
        WHERE workspace_id = ? AND ppp_user IN (${ids.map(() => '?').join(',')})`,
      [wsId, ...ids]
    );
  } else {
    tunnels = await query(
      `SELECT ppp_user, nombre_vrf, nombre_nodo FROM nodes WHERE workspace_id = ?`,
      [wsId]
    );
  }
  if (!tunnels.length) return reply(chatId, 'Tu workspace no tiene túneles cargados.');

  const lines = tunnels.slice(0, 30).map(t =>
    `• <code>${t.nombre_vrf || t.ppp_user}</code> — ${t.nombre_nodo || 'sin nombre'}`
  );
  return reply(chatId,
    `<b>Túneles disponibles</b> (${tunnels.length})\n\n` +
    lines.join('\n') + '\n\n' +
    `Para activar: <code>/activar VRF-NOMBRE</code>`
  );
}

async function cmdActivar(chatId, user, args) {
  if (!user) return reply(chatId, '🔒 Tu chat no está vinculado. Envía /start.');
  const target = String(args[0] || '').trim();
  if (!target) return reply(chatId, 'Uso: <code>/activar VRF-NOMBRE</code>');
  const url = panelUrl(`activate=${encodeURIComponent(target)}`);
  return reply(chatId,
    `🔗 Abre este enlace en el navegador donde tengas la sesión iniciada:\n${url}\n\n` +
    `Por seguridad, el bot no activa túneles directamente — confirma en el panel.`
  );
}

async function cmdDesactivar(chatId, user) {
  if (!user) return reply(chatId, '🔒 Tu chat no está vinculado. Envía /start.');
  const url = panelUrl('deactivate=1');
  return reply(chatId,
    `🔗 Abre este enlace para desactivar:\n${url}`
  );
}

// ── Dispatcher ────────────────────────────────────────────────────
const COMMANDS = {
  '/start': cmdStart,
  '/help': cmdHelp,
  '/link': cmdLink,
  '/unlink': cmdUnlink,
  '/status': cmdStatus,
  '/tuneles': cmdTuneles,
  '/activar': cmdActivar,
  '/desactivar': cmdDesactivar,
};

/**
 * Procesa un mensaje individual (exportado para tests).
 * Devuelve void; el side-effect es el reply de Telegram.
 */
async function handleMessage(msg) {
  if (!msg || !msg.chat || !msg.text) return;
  const chatId = msg.chat.id;
  const text = msg.text.trim();
  if (!text.startsWith('/')) return; // ignora mensajes que no son comando

  // /command@BotName argumentos...
  const [first, ...rest] = text.split(/\s+/);
  const cmd = first.split('@')[0].toLowerCase();
  const args = rest;

  const handler = COMMANDS[cmd];
  if (!handler) {
    return reply(chatId, `Comando desconocido: <code>${cmd}</code>. Usa /help.`);
  }

  // /link y /start son los únicos sin auth previa.
  if (cmd === '/link') return handler(chatId, args);
  if (cmd === '/start' || cmd === '/help') {
    const user = await userForChat(chatId);
    return handler(chatId, user);
  }

  // Resto requiere chat vinculado.
  const user = await userForChat(chatId);
  if (!user) {
    return reply(chatId, '🔒 Tu chat no está vinculado. Envía /start.');
  }
  return handler(chatId, user, args);
}

// ── Long-polling loop ─────────────────────────────────────────────
async function getUpdates(signal) {
  const url = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getUpdates` +
              `?timeout=${POLL_TIMEOUT_SEC}&offset=${_offset}&allowed_updates=${encodeURIComponent('["message"]')}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`getUpdates HTTP ${res.status}`);
  const data = await res.json();
  if (!data.ok) throw new Error(`getUpdates: ${data.description || 'unknown'}`);
  return data.result;
}

async function loop() {
  while (_running) {
    try {
      const updates = await getUpdates(_abort.signal);
      for (const u of updates) {
        _offset = u.update_id + 1;
        if (u.message) {
          handleMessage(u.message).catch(err =>
            log.warn({ err: err.message, updateId: u.update_id }, 'handler falló'));
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') return;
      log.warn({ err: err.message }, 'loop error, retry en 2s');
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
    }
  }
}

function start() {
  if (_running) return;
  if (process.env.TELEGRAM_BOT_ENABLED === 'false') {
    log.info('Deshabilitado por TELEGRAM_BOT_ENABLED=false');
    return;
  }
  if (!telegram.isConfigured()) {
    log.info('TELEGRAM_BOT_TOKEN no configurado — bot no inicia');
    return;
  }
  _running = true;
  _abort = new AbortController();
  log.info('Bot iniciado (long-polling)');
  loop().catch(err => log.error({ err: err.message }, 'loop terminó con error'));
}

function stop() {
  if (!_running) return;
  _running = false;
  if (_abort) _abort.abort();
  _abort = null;
  log.info('Bot detenido');
}

module.exports = {
  start,
  stop,
  // Exportados para tests
  handleMessage,
  COMMANDS,
};
