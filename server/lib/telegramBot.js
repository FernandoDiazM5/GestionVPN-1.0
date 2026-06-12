// ============================================================
//  lib/telegramBot.js — bot Telegram interactivo (M1 + iter2)
//
//  iter2: /activar y /desactivar ejecutan acción real (antes daban
//  deep-link). /activar sin args muestra lista numerada con TTL 15 min;
//  el usuario responde con el número.
//
//  Modelo: long-polling con getUpdates (sin HTTPS público, sin webhook).
//   • Loop con offset incremental.
//   • timeout 25s en cada getUpdates.
//   • AbortController para shutdown limpio.
//
//  Comandos:
//   • /start              — bienvenida + estado de vinculación.
//   • /help               — lista de comandos.
//   • /link CODE          — confirma vinculación con el panel.
//   • /unlink             — desvincula el chat.
//   • /status             — sesión activa del usuario.
//   • /tuneles            — lista numerada de túneles disponibles.
//   • /activar            — lista numerada con selección en 15 min.
//   • /activar VRF-X      — activa el VRF directo (legacy).
//   • /activar <n>        — activa por número (mismo efecto que responder solo <n>).
//   • /desactivar         — desactiva el túnel actual del usuario.
//   • /cancelar           — descarta una lista pendiente.
//
//  Seguridad:
//   • Auth por chat_id vinculado (notification_subscriptions).
//   • activate/deactivate llaman al MISMO service que el panel
//     (lib/tunnelService) — pasan por canUseTunnelForAccount, mgmtIpRepo
//     server-side, sessionRepo, notifier. Cero camino alterno.
// ============================================================
const log = require('./logger').child({ scope: 'telegram-bot' });
const telegram = require('./telegram');
const notificationRepo = require('../db/repos/notificationRepo');
const sessionRepo = require('../db/repos/sessionRepo');
const userRepo = require('../db/repos/userRepo');
const assignmentRepo = require('../db/repos/assignmentRepo');
const { query } = require('../db/mysql');
const tunnelService = require('./tunnelService');
const { getAppSetting, decryptPass } = require('../db.service');

const POLL_TIMEOUT_SEC = 25;
const RETRY_DELAY_MS = 2000;
const SELECTION_TTL_MS = 15 * 60 * 1000;     // 15 min para responder con el número

let _running = false;
let _offset = 0;
let _abort = null;

// pendingSelections — chatId → { tunnels, expiresAt }
// Map en memoria. Si el backend reinicia se pierden las pendientes;
// el usuario simplemente envía /activar de nuevo.
const pendingSelections = new Map();

// ── Helpers de identidad ──────────────────────────────────────────
async function userForChat(chatId) {
  const rows = await query(
    'SELECT user_id FROM notification_subscriptions WHERE telegram_chat_id = ? LIMIT 1',
    [String(chatId)]
  );
  if (!rows.length) return null;
  return await userRepo.findById(rows[0].user_id).catch(() => null);
}

/** Construye un "account" compatible con tunnelService (sub/workspace_id/role/platform_admin). */
async function buildAccount(userId) {
  const ws = await query(
    `SELECT workspace_id, role FROM workspace_members
      WHERE user_id = ? AND deleted_at IS NULL LIMIT 1`,
    [userId]
  );
  if (!ws.length) return null;
  const u = await query('SELECT is_platform_admin FROM users WHERE id = ? LIMIT 1', [userId]);
  return {
    sub: userId,
    workspace_id: ws[0].workspace_id,
    role: ws[0].role,
    platform_admin: !!(u[0]?.is_platform_admin),
  };
}

/** Carga MT_IP/MT_USER/MT_PASS desde app_settings (mismo patrón que monitoringJob). */
async function getCoreCreds() {
  const ip = await getAppSetting('MT_IP');
  const user = await getAppSetting('MT_USER');
  const passData = await getAppSetting('MT_PASS');
  if (!ip || !user || !passData) return null;
  try {
    return { ip, user, pass: decryptPass(passData) };
  } catch (_) {
    return null;
  }
}

// ── Helpers de reply ──────────────────────────────────────────────
function reply(chatId, text) {
  return telegram.sendMessage({ chatId, text, html: true });
}

// ── Helpers de selección pendiente ────────────────────────────────
function getPending(chatId) {
  const p = pendingSelections.get(chatId);
  if (!p) return null;
  if (Date.now() > p.expiresAt) {
    pendingSelections.delete(chatId);
    return null;
  }
  return p;
}
function setPending(chatId, tunnels) {
  pendingSelections.set(chatId, { tunnels, expiresAt: Date.now() + SELECTION_TTL_MS });
}
function clearPending(chatId) {
  pendingSelections.delete(chatId);
}

// ── Listado de túneles para el usuario ────────────────────────────
/**
 * Devuelve los túneles que el usuario puede activar (según rol).
 *  - MEMBER  → solo asignados
 *  - OWNER/CO_MOD → todos del workspace
 * Devuelve hasta 30 (mismo límite que /tuneles antes).
 */
async function fetchUserTunnels(userId) {
  const ws = await query(
    `SELECT workspace_id, role FROM workspace_members
      WHERE user_id = ? AND deleted_at IS NULL LIMIT 1`,
    [userId]
  );
  if (!ws.length) return { error: 'Tu cuenta no tiene workspace asignado.' };
  const { workspace_id: wsId, role } = ws[0];

  let tunnels;
  if (role === 'MEMBER') {
    const ids = await assignmentRepo.assignedTunnelIds(wsId, userId);
    if (!ids.length) return { error: 'No tienes túneles asignados.' };
    // El `tunnel_id` guardado en `tunnel_assignments` puede contener cualquiera
    // de los dos identificadores: el modal de asignar usa `nombre_vrf || ppp_user`
    // (la mayoría termina siendo el VRF). Filtramos por ambos campos, mismo
    // patrón que `routes/nodes/_shared.js` aplica al HTTP filtro de nodos.
    const placeholders = ids.map(() => '?').join(',');
    tunnels = await query(
      `SELECT ppp_user, nombre_vrf, nombre_nodo FROM nodes
        WHERE workspace_id = ?
          AND (nombre_vrf IN (${placeholders}) OR ppp_user IN (${placeholders}))`,
      [wsId, ...ids, ...ids]
    );
  } else {
    tunnels = await query(
      `SELECT ppp_user, nombre_vrf, nombre_nodo FROM nodes WHERE workspace_id = ?`,
      [wsId]
    );
  }
  if (!tunnels.length) return { error: 'Tu workspace no tiene túneles cargados.' };
  return { tunnels: tunnels.slice(0, 30) };
}

function formatNumberedList(tunnels) {
  return tunnels.map((t, i) =>
    `${i + 1}) <code>${t.nombre_vrf || t.ppp_user}</code> — ${t.nombre_nodo || 'sin nombre'}`
  ).join('\n');
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
    '3) Envíame: <code>/link CODE</code>'
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
      '/tuneles — lista numerada de túneles',
      '/activar — elige un número de la lista (TTL 15 min)',
      '/activar &lt;n&gt; — activa por número directo',
      '/activar &lt;VRF&gt; — activa por nombre',
      '/desactivar — cierra tu túnel actual',
      '/cancelar — descarta una selección pendiente',
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
  clearPending(chatId);
  await notificationRepo.unlinkTelegram(user.id);
  return reply(chatId, '🔓 Chat desvinculado. Cuando quieras, /link CODE de nuevo.');
}

async function cmdStatus(chatId, user) {
  if (!user) return reply(chatId, '🔒 Tu chat no está vinculado. Envía /start.');
  const ws = await query(
    `SELECT workspace_id FROM workspace_members
      WHERE user_id = ? AND deleted_at IS NULL LIMIT 1`,
    [user.id]
  );
  if (!ws.length) return reply(chatId, 'Tu cuenta no tiene workspace asignado.');
  const sess = await sessionRepo.getActiveByUser(ws[0].workspace_id, user.id);
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
  const r = await fetchUserTunnels(user.id);
  if (r.error) return reply(chatId, r.error);
  return reply(chatId,
    `<b>Túneles disponibles</b> (${r.tunnels.length})\n\n` +
    formatNumberedList(r.tunnels) + '\n\n' +
    `Para activar uno: <code>/activar</code> y responde con el número.`
  );
}

/**
 * Núcleo de activación llamado desde varias rutas (lista numerada,
 * /activar N, /activar VRF). Recibe el VRF ya resuelto.
 */
async function performActivate(chatId, user, vrf) {
  const account = await buildAccount(user.id);
  if (!account) return reply(chatId, '❌ Tu cuenta no tiene workspace asignado.');
  const mikrotik = await getCoreCreds();
  if (!mikrotik) return reply(chatId, '❌ El MikroTik no está configurado en el panel (Ajustes). Avisa al admin de plataforma.');

  await reply(chatId, `⏳ Activando <code>${vrf}</code>…`);
  const result = await tunnelService.activateTunnel({
    account, targetVRF: vrf, mikrotik, clientIp: 'telegram',
  });
  if (!result.ok) {
    return reply(chatId, `❌ <b>No se pudo activar</b>\n${result.message}`);
  }
  const minutes = result.expiresAt ? Math.round((result.expiresAt - Date.now()) / 60000) : null;
  return reply(chatId,
    `✅ <b>Acceso abierto a ${result.vrf}</b>\n` +
    `IP de gestión: <code>${result.mgmtIp}</code>\n` +
    (minutes != null ? `Expira en: ${minutes} min\n` : '') +
    (result.switched ? '<i>(reemplazó tu sesión anterior)</i>' : '')
  );
}

async function cmdActivar(chatId, user, args) {
  if (!user) return reply(chatId, '🔒 Tu chat no está vinculado. Envía /start.');

  const arg = String(args[0] || '').trim();

  // Caso 1 — sin argumentos: muestra lista numerada
  if (!arg) {
    const r = await fetchUserTunnels(user.id);
    if (r.error) return reply(chatId, r.error);
    setPending(chatId, r.tunnels);
    return reply(chatId,
      `<b>Elige un túnel para activar</b> (responde con el número)\n\n` +
      formatNumberedList(r.tunnels) + '\n\n' +
      `<i>La selección expira en 15 min. Envía /cancelar para descartar.</i>`
    );
  }

  // Caso 2 — argumento numérico: activa por índice de la lista pendiente
  if (/^\d+$/.test(arg)) {
    return resolveSelectionAndActivate(chatId, user, Number(arg));
  }

  // Caso 3 — argumento texto (VRF): activación directa
  clearPending(chatId);
  return performActivate(chatId, user, arg);
}

/**
 * Cuando el usuario responde con un número (vía /activar N o mensaje plano).
 * Valida que haya pending y que el índice esté en rango.
 */
async function resolveSelectionAndActivate(chatId, user, n) {
  const pending = getPending(chatId);
  if (!pending) {
    return reply(chatId, '⌛ No hay una lista pendiente. Envía /activar para empezar.');
  }
  if (n < 1 || n > pending.tunnels.length) {
    return reply(chatId, `❌ Número fuera de rango (1-${pending.tunnels.length}).`);
  }
  const t = pending.tunnels[n - 1];
  clearPending(chatId);
  const vrf = t.nombre_vrf || t.ppp_user;
  return performActivate(chatId, user, vrf);
}

async function cmdDesactivar(chatId, user) {
  if (!user) return reply(chatId, '🔒 Tu chat no está vinculado. Envía /start.');
  clearPending(chatId);

  const account = await buildAccount(user.id);
  if (!account) return reply(chatId, '❌ Tu cuenta no tiene workspace asignado.');
  const mikrotik = await getCoreCreds();
  if (!mikrotik) return reply(chatId, '❌ El MikroTik no está configurado en el panel.');

  await reply(chatId, '⏳ Desactivando tu túnel…');
  const result = await tunnelService.deactivateTunnel({
    account, mikrotik, clientIp: 'telegram',
  });
  if (!result.ok) {
    return reply(chatId, `❌ <b>No se pudo desactivar</b>\n${result.message}`);
  }
  if (!result.hadSession) {
    return reply(chatId, '🔒 No tenías túnel activo. (Mangle limpia igualmente.)');
  }
  return reply(chatId, `✅ Túnel <code>${result.vrf || result.tunnelId}</code> desactivado.`);
}

async function cmdCancelar(chatId, user) {
  if (!user) return reply(chatId, '🔒 Tu chat no está vinculado. Envía /start.');
  const had = pendingSelections.has(chatId);
  clearPending(chatId);
  return reply(chatId, had ? '✓ Selección cancelada.' : 'No tenías una lista pendiente.');
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
  '/cancelar': cmdCancelar,
};

/**
 * Procesa un mensaje individual (exportado para tests).
 * Trata como "selección numérica" cualquier mensaje plano sin `/` que sea
 * solo un número, si hay pending selection viva para el chat.
 */
async function handleMessage(msg) {
  if (!msg || !msg.chat || !msg.text) return;
  const chatId = msg.chat.id;
  const text = msg.text.trim();

  // Mensaje plano que no es comando
  if (!text.startsWith('/')) {
    // ¿Es un número solo y hay selección pendiente?
    if (/^\d+$/.test(text) && pendingSelections.has(chatId)) {
      const user = await userForChat(chatId);
      if (!user) return reply(chatId, '🔒 Tu chat no está vinculado. Envía /start.');
      return resolveSelectionAndActivate(chatId, user, Number(text));
    }
    return; // ignora chat normal
  }

  // /command@BotName argumentos...
  const [first, ...rest] = text.split(/\s+/);
  const cmd = first.split('@')[0].toLowerCase();
  const args = rest;

  const handler = COMMANDS[cmd];
  if (!handler) {
    return reply(chatId, `Comando desconocido: <code>${cmd}</code>. Usa /help.`);
  }

  if (cmd === '/link') return handler(chatId, args);
  if (cmd === '/start' || cmd === '/help') {
    const user = await userForChat(chatId);
    return handler(chatId, user);
  }

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
  start, stop, handleMessage,
  // Para tests:
  _pendingSelections: pendingSelections,
};
