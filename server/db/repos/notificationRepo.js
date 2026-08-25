// ============================================================
//  notificationRepo — suscripciones y log de notificaciones
//
//  channels y event_types se guardan como TEXT JSON.
//  Parser tolerante: si el JSON está corrupto, devuelve defaults.
// ============================================================
const crypto = require('crypto');
const { query } = require('../mysql');
const logger = require('../../lib/logger').child({ scope: 'notification-repo' });

const DEFAULT_CHANNELS = { email: true, telegram: false };
const DEFAULT_EVENTS = ['TUNNEL_ACTIVATED', 'TUNNEL_DEACTIVATED', 'SESSION_EXPIRED'];

// Detecta el error "tabla no existe" — útil para devolver defaults en lugar
// de 500 si el operador olvidó correr `npm run migrate:notifications`.
function isNoTableErr(err) {
  return err && (err.code === 'ER_NO_SUCH_TABLE' || /doesn['’]t exist/i.test(err.message || ''));
}
let _warnedNoTable = false;
function warnOnceNoTable() {
  if (_warnedNoTable) return;
  _warnedNoTable = true;
  logger.warn('Tablas notification_* aún no existen. Corre `cd server && npm run migrate:notifications`. Mientras tanto se sirven defaults.');
}

function parse(json, fallback) {
  try { return JSON.parse(json); } catch { return fallback; }
}

function normalize(row) {
  if (!row) return null;
  return {
    user_id: row.user_id,
    channels: parse(row.channels, DEFAULT_CHANNELS),
    event_types: parse(row.event_types, DEFAULT_EVENTS),
    telegram_chat_id: row.telegram_chat_id || null,
    telegram_bot_fingerprint: row.telegram_bot_fingerprint || null,
    telegram_link_code: row.telegram_link_code || null,
    telegram_link_expires_at: row.telegram_link_expires_at || null,
    paused: !!row.paused,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function getByUser(userId) {
  try {
    const rows = await query(
      'SELECT * FROM notification_subscriptions WHERE user_id = ? LIMIT 1',
      [userId]
    );
    return normalize(rows[0] || null);
  } catch (err) {
    if (isNoTableErr(err)) { warnOnceNoTable(); return null; }
    throw err;
  }
}

/** Devuelve la sub o una sub "fantasma" con defaults (sin insertar). */
async function getOrDefault(userId) {
  const existing = await getByUser(userId);
  if (existing) return existing;
  return {
    user_id: userId,
    channels: DEFAULT_CHANNELS,
    event_types: DEFAULT_EVENTS,
    telegram_chat_id: null,
    telegram_link_code: null,
    telegram_link_expires_at: null,
    paused: false,
    created_at: 0,
    updated_at: 0,
  };
}

/** Upsert de canales / eventos / paused. NO toca telegram_chat_id. */
async function updatePreferences({ userId, channels, eventTypes, paused }) {
  const now = Date.now();
  await query(
    `INSERT INTO notification_subscriptions
       (user_id, channels, event_types, paused, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       channels = VALUES(channels),
       event_types = VALUES(event_types),
       paused = VALUES(paused),
       updated_at = VALUES(updated_at)`,
    [userId, JSON.stringify(channels), JSON.stringify(eventTypes), paused ? 1 : 0, now, now]
  );
}

/** Inicia vinculación con Telegram: genera código de 6 chars con TTL 15min. */
async function generateTelegramLinkCode(userId) {
  const code = crypto.randomBytes(3).toString('hex').toUpperCase(); // 6 chars
  const now = Date.now();
  const expires = now + 15 * 60 * 1000;
  await query(
    `INSERT INTO notification_subscriptions
       (user_id, telegram_link_code, telegram_link_expires_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       telegram_link_code = VALUES(telegram_link_code),
       telegram_link_expires_at = VALUES(telegram_link_expires_at),
       updated_at = VALUES(updated_at)`,
    [userId, code, expires, now, now]
  );
  return { code, expiresAt: expires };
}

/** Confirma vinculación: el bot recibe /start <code> y llamamos esto. */
async function confirmTelegramLink({ code, chatId, workspaceId = null, platformOnly = false, botFingerprint }) {
  if (!/^[a-f0-9]{64}$/.test(String(botFingerprint || ''))) return { ok: false, error: 'bot no identificado' };
  let sql = `SELECT n.user_id,n.telegram_link_expires_at FROM notification_subscriptions n`;
  const params = [];
  if (workspaceId) { sql += ` JOIN workspace_members wm ON wm.user_id=n.user_id AND wm.workspace_id=? AND wm.deleted_at IS NULL`; params.push(workspaceId); }
  if (platformOnly) sql += ` JOIN users u ON u.id=n.user_id AND u.is_platform_admin=1 AND u.deleted_at IS NULL`;
  sql += ` WHERE n.telegram_link_code=? LIMIT 1`;
  params.push(code);
  const rows = await query(sql, params);
  const row = rows[0];
  if (!row) return { ok: false, error: 'código inválido' };
  if (row.telegram_link_expires_at && row.telegram_link_expires_at < Date.now()) {
    return { ok: false, error: 'código expirado' };
  }
  await query(
    `UPDATE notification_subscriptions
        SET telegram_chat_id = ?, telegram_bot_fingerprint = ?, telegram_link_code = NULL,
            telegram_link_expires_at = NULL, updated_at = ?
      WHERE user_id = ?`,
    [String(chatId), botFingerprint, Date.now(), row.user_id]
  );
  return { ok: true, userId: row.user_id };
}

async function unlinkTelegram(userId) {
  await query(
    `UPDATE notification_subscriptions
        SET telegram_chat_id = NULL, telegram_bot_fingerprint = NULL, telegram_link_code = NULL,
            telegram_link_expires_at = NULL,
            channels = JSON_SET(COALESCE(channels, '{}'), '$.telegram', FALSE), updated_at = ?
      WHERE user_id = ?`,
    [Date.now(), userId]
  );
}

async function listPlatformAdminsWithTelegram() {
  try {
    return await query(`SELECT u.id AS user_id,n.telegram_chat_id
      FROM users u JOIN notification_subscriptions n ON n.user_id=u.id
      WHERE u.is_platform_admin=1 AND u.deleted_at IS NULL AND u.disabled_at IS NULL
        AND n.telegram_chat_id IS NOT NULL AND n.telegram_chat_id<>'' AND n.paused=0`);
  } catch (err) {
    if (isNoTableErr(err)) { warnOnceNoTable(); return []; }
    throw err;
  }
}

/** Append al log. Best-effort — no throwa para no romper el flujo. */
async function log({ userId, event, channel, status, detail }) {
  try {
    await query(
      `INSERT INTO notification_log
         (id, user_id, event, channel, status, detail, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [crypto.randomUUID(), userId, event, channel, status, detail || null, Date.now()]
    );
  } catch (_) { /* swallow — log es auditoría, no flow */ }
}

module.exports = {
  DEFAULT_CHANNELS,
  DEFAULT_EVENTS,
  getByUser,
  getOrDefault,
  updatePreferences,
  generateTelegramLinkCode,
  confirmTelegramLink,
  unlinkTelegram,
  listPlatformAdminsWithTelegram,
  log,
};
