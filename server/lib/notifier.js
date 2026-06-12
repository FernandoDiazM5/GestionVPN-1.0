// ============================================================
//  lib/notifier.js — dispatcher unificado de notificaciones
//
//  API:
//     notify({ userId, event, subject, html, text, payload })
//
//  El caller solo dice "qué pasó". El notifier:
//     1. Lee la suscripción del usuario (sub.event_types y sub.channels).
//     2. Si event no está en sub.event_types, skip.
//     3. Si paused, skip.
//     4. Para cada canal habilitado, dispatcha.
//     5. Loguea cada intento en notification_log.
//
//  Eventos soportados (kebab-screaming):
//     TUNNEL_ACTIVATED · TUNNEL_DEACTIVATED · SESSION_EXPIRED
//
//  El template de mensaje se construye aquí (consistente entre canales)
//  para que el caller no se preocupe por formatos.
// ============================================================
const log = require('./logger').child({ scope: 'notifier' });
const notificationRepo = require('../db/repos/notificationRepo');
const userRepo = require('../db/repos/userRepo');
const mailer = require('./mailer');
const telegram = require('./telegram');

const EVENT_LABEL = {
  TUNNEL_ACTIVATED: 'Túnel activado',
  TUNNEL_DEACTIVATED: 'Túnel desactivado',
  SESSION_EXPIRED: 'Sesión expirada',
  NODE_DOWN: 'Nodo caído',
  NODE_RECOVERED: 'Nodo recuperado',
};

/**
 * Construye el texto del mensaje según el evento y el payload.
 * Devuelve { subject, html, text } — usado para email y Telegram.
 */
function buildMessage(event, payload = {}) {
  const label = EVENT_LABEL[event] || event;
  const { tunnelId, vrf, expiresAt, ip, by } = payload;
  const when = new Date().toLocaleString('es-PE', { timeZone: 'America/Lima' });

  switch (event) {
    case 'TUNNEL_ACTIVATED':
      return {
        subject: `[VPN] ${label} · ${tunnelId || vrf}`,
        html: `<b>🔓 ${label}</b><br>Túnel: <code>${tunnelId || vrf}</code><br>` +
              `${by ? `Por: <code>${by}</code><br>` : ''}` +
              `${ip ? `Desde IP: <code>${ip}</code><br>` : ''}` +
              `${expiresAt ? `Expira: ${new Date(expiresAt).toLocaleString('es-PE')}<br>` : ''}` +
              `Fecha: ${when}`,
        text: `${label}\nTúnel: ${tunnelId || vrf}\n` +
              `${by ? `Por: ${by}\n` : ''}` +
              `${ip ? `Desde IP: ${ip}\n` : ''}` +
              `${expiresAt ? `Expira: ${new Date(expiresAt).toLocaleString('es-PE')}\n` : ''}` +
              `Fecha: ${when}`,
      };
    case 'TUNNEL_DEACTIVATED':
      return {
        subject: `[VPN] ${label} · ${tunnelId || vrf}`,
        html: `<b>🔒 ${label}</b><br>Túnel: <code>${tunnelId || vrf}</code><br>` +
              `${by ? `Por: <code>${by}</code><br>` : ''}Fecha: ${when}`,
        text: `${label}\nTúnel: ${tunnelId || vrf}\n` +
              `${by ? `Por: ${by}\n` : ''}Fecha: ${when}`,
      };
    case 'SESSION_EXPIRED':
      return {
        subject: `[VPN] ${label} · ${tunnelId || vrf}`,
        html: `<b>⏰ ${label}</b><br>El túnel <code>${tunnelId || vrf}</code> caducó por TTL.<br>` +
              `Reactívalo desde el panel si lo necesitas.<br>Fecha: ${when}`,
        text: `${label}\nEl túnel ${tunnelId || vrf} caducó por TTL.\n` +
              `Reactívalo desde el panel si lo necesitas.\nFecha: ${when}`,
      };
    case 'NODE_DOWN': {
      const nodeName = payload.nodeName || tunnelId || vrf || '—';
      const fails = payload.failCount != null ? `${payload.failCount} polls fallidos` : '';
      return {
        subject: `[VPN] 🔴 ${label} · ${nodeName}`,
        html: `<b>🔴 ${label}</b><br>El nodo <code>${nodeName}</code> dejó de responder.<br>` +
              `${fails ? `Estado: ${fails}<br>` : ''}` +
              `Revisa el panel para diagnosticar.<br>Fecha: ${when}`,
        text: `${label}\nEl nodo ${nodeName} dejó de responder.\n` +
              `${fails ? `${fails}\n` : ''}` +
              `Revisa el panel para diagnosticar.\nFecha: ${when}`,
      };
    }
    case 'NODE_RECOVERED': {
      const nodeName = payload.nodeName || tunnelId || vrf || '—';
      const downSecs = payload.downSeconds != null ? Math.floor(payload.downSeconds) : null;
      const downStr = downSecs == null ? '' :
        downSecs < 60 ? `${downSecs}s` :
        downSecs < 3600 ? `${Math.floor(downSecs / 60)}m ${downSecs % 60}s` :
        `${Math.floor(downSecs / 3600)}h ${Math.floor((downSecs % 3600) / 60)}m`;
      return {
        subject: `[VPN] ✅ ${label} · ${nodeName}`,
        html: `<b>✅ ${label}</b><br>El nodo <code>${nodeName}</code> volvió a responder.<br>` +
              `${downStr ? `Estuvo caído: ${downStr}<br>` : ''}` +
              `Fecha: ${when}`,
        text: `${label}\nEl nodo ${nodeName} volvió a responder.\n` +
              `${downStr ? `Estuvo caído: ${downStr}\n` : ''}` +
              `Fecha: ${when}`,
      };
    }
    default:
      return {
        subject: `[VPN] ${label}`,
        html: `<b>${label}</b><br>Fecha: ${when}`,
        text: `${label}\nFecha: ${when}`,
      };
  }
}

async function dispatchEmail(user, msg) {
  if (!user?.email) return { ok: false, reason: 'sin email' };
  try {
    const out = await mailer.sendGeneric({
      to: user.email,
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
    });
    return { ok: out?.delivered !== false, error: out?.error };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function dispatchTelegram(sub, msg) {
  if (!sub.telegram_chat_id) return { ok: false, reason: 'sin chat_id vinculado' };
  const out = await telegram.sendMessage({
    chatId: sub.telegram_chat_id,
    text: msg.html,   // Telegram acepta HTML; usamos el mismo render
    html: true,
  });
  return { ok: out.ok, error: out.error, skipped: out.skipped };
}

/**
 * Notifica un evento a un usuario, respetando sus preferencias.
 *
 * @param {Object} args
 * @param {string} args.userId
 * @param {string} args.event   — 'TUNNEL_ACTIVATED' | 'TUNNEL_DEACTIVATED' | 'SESSION_EXPIRED'
 * @param {Object} [args.payload]
 * @returns {Promise<{ skipped?: string, results?: { email?: any, telegram?: any } }>}
 */
async function notify({ userId, event, payload = {} }) {
  if (!userId || !event) return { skipped: 'userId/event requeridos' };
  let sub;
  try {
    sub = await notificationRepo.getOrDefault(userId);
  } catch (err) {
    log.warn({ err: err.message, userId }, 'No se pudo leer suscripción');
    return { skipped: 'error de BD' };
  }

  if (sub.paused) return { skipped: 'usuario pausado' };
  if (!sub.event_types.includes(event)) return { skipped: 'evento no suscrito' };

  let user;
  try {
    user = await userRepo.findById(userId);
  } catch (_) { user = null; }

  const msg = buildMessage(event, payload);
  const results = {};

  if (sub.channels.email) {
    results.email = await dispatchEmail(user, msg);
    void notificationRepo.log({
      userId, event, channel: 'email',
      status: results.email.ok ? 'sent' : 'failed',
      detail: results.email.error || results.email.reason || null,
    });
  }

  if (sub.channels.telegram) {
    results.telegram = await dispatchTelegram(sub, msg);
    void notificationRepo.log({
      userId, event, channel: 'telegram',
      status: results.telegram.skipped ? 'skipped'
            : results.telegram.ok ? 'sent' : 'failed',
      detail: results.telegram.error || results.telegram.reason || null,
    });
  }

  return { results };
}

module.exports = { notify, buildMessage };
