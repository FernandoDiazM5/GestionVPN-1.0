// ============================================================
//  notificationRepo — suscripciones y log de notificaciones
//
//  channels y event_types se guardan como TEXT JSON.
//  Parser tolerante: si el JSON está corrupto, devuelve defaults.
// ============================================================
const crypto = require('crypto');
const { query } = require('../mysql');

const DEFAULT_CHANNELS = { email: true, telegram: false };
const DEFAULT_EVENTS = ['TUNNEL_ACTIVATED', 'TUNNEL_DEACTIVATED', 'SESSION_EXPIRED'];

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
    telegram_link_code: row.telegram_link_code || null,
    telegram_link_expires_at: row.telegram_link_expires_at || null,
    paused: !!row.paused,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function getByUser(userId) {
  const rows = await query(
    'SELECT * FROM notification_subscriptions WHERE user_id = ? LIMIT 1',
    [userId]
  );
  return normalize(rows[0] || null);
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
async function confirmTelegramLink({ code, chatId }) {
  const rows = await query(
    `SELECT user_id, telegram_link_expires_at FROM notification_subscriptions
       WHERE telegram_link_code = ? LIMIT 1`,
    [code]
  );
  const row = rows[0];
  if (!row) return { ok: false, error: 'código inválido' };
  if (row.telegram_link_expires_at && row.telegram_link_expires_at < Date.now()) {
    return { ok: false, error: 'código expirado' };
  }
  await query(
    `UPDATE notification_subscriptions
        SET telegram_chat_id = ?, telegram_link_code = NULL,
            telegram_link_expires_at = NULL, updated_at = ?
      WHERE user_id = ?`,
    [String(chatId), Date.now(), row.user_id]
  );
  return { ok: true, userId: row.user_id };
}

async function unlinkTelegram(userId) {
  await query(
    `UPDATE notification_subscriptions
        SET telegram_chat_id = NULL, updated_at = ?
      WHERE user_id = ?`,
    [Date.now(), userId]
  );
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
  log,
};
