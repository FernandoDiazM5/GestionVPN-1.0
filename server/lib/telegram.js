// ============================================================
//  lib/telegram.js — cliente Telegram Bot API mínimo
//
//  Solo sendMessage de momento (no recibe updates). Para M1 — bot
//  interactivo que activa túneles — agregar long-polling en otra capa.
//
//  Config:
//    TELEGRAM_BOT_TOKEN=123456:ABCD-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
//
//  Sin token configurado, sendMessage hace no-op (devuelve { skipped: true })
//  para que el flujo del notifier no falle en desarrollo.
// ============================================================
const log = require('./logger').child({ scope: 'telegram' });

const BASE_URL = 'https://api.telegram.org';
const TIMEOUT_MS = 8000;

function isConfigured(token = process.env.TELEGRAM_BOT_TOKEN) {
  return !!(token && token.includes(':'));
}

// Cache del username del bot. undefined = no consultado · null = desconocido · string = ok.
const cachedUsernames = new Map();

/**
 * Devuelve el @username del bot (sin la @) para construir `https://t.me/<user>`.
 * Prioriza TELEGRAM_BOT_USERNAME (sin red); si no, lo resuelve una vez con
 * getMe y lo cachea. Nunca lanza: ante fallo devuelve null y el frontend
 * degrada (muestra el código sin enlace directo al bot).
 * @returns {Promise<string|null>}
 */
async function getBotUsername(token = process.env.TELEGRAM_BOT_TOKEN) {
  const envName = process.env.TELEGRAM_BOT_USERNAME;
  if (envName) return envName.replace(/^@/, '');
  if (!isConfigured(token)) return null;
  if (cachedUsernames.has(token)) return cachedUsernames.get(token);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}/bot${token}/getMe`, { signal: controller.signal });
    const data = await res.json().catch(() => ({}));
    cachedUsernames.set(token, (data.ok && data.result && data.result.username) ? data.result.username : null);
  } catch (err) {
    log.debug({ err: err.message }, 'getMe falló — username de bot desconocido');
    cachedUsernames.set(token, null);
  } finally {
    clearTimeout(timer);
  }
  return cachedUsernames.get(token) || null;
}

/**
 * Envía un mensaje a un chat de Telegram.
 *
 * @param {Object} args
 * @param {string} args.chatId  ID numérico (string para evitar precisión float)
 * @param {string} args.text    Texto plano o HTML
 * @param {boolean} [args.html=true]  Usa parse_mode=HTML
 * @returns {Promise<{ok:boolean, skipped?:boolean, error?:string, status?:number}>}
 */
async function sendMessage({ chatId, text, html = true, token, replyMarkup, threadId }) {
  if (!token) token = (await require('./platformIntegrationService').getSecret('TELEGRAM').catch(() => null))?.botToken || process.env.TELEGRAM_BOT_TOKEN;
  if (!isConfigured(token)) {
    log.debug({ chatId }, 'sendMessage skipped — TELEGRAM_BOT_TOKEN no configurado');
    return { ok: false, skipped: true };
  }
  if (!chatId || !text) return { ok: false, error: 'chatId y text requeridos' };

  const url = `${BASE_URL}/bot${token}/sendMessage`;
  const body = {
    chat_id: chatId,
    ...(threadId ? { message_thread_id: Number(threadId) } : {}),
    text: String(text).slice(0, 4000), // Telegram límite 4096; deja margen
    ...(html ? { parse_mode: 'HTML' } : {}),
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    disable_web_page_preview: true,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok !== true) {
      log.warn({ status: res.status, code: data.error_code, desc: data.description }, 'Telegram error');
      return { ok: false, status: res.status, error: data.description || `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    if (err.name === 'AbortError') return { ok: false, error: `timeout ${TIMEOUT_MS}ms` };
    log.warn({ err: err.message }, 'Telegram request fallido');
    return { ok: false, error: err.message };
  } finally {
    clearTimeout(timer);
  }
}

async function answerCallbackQuery({ token, callbackQueryId, text }) {
  if (!isConfigured(token) || !callbackQueryId) return { ok: false, skipped: true };
  try {
    const res = await fetch(`${BASE_URL}/bot${token}/answerCallbackQuery`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: callbackQueryId, ...(text ? { text } : {}) }),
    });
    const data = await res.json().catch(() => ({}));
    return res.ok && data.ok === true ? { ok: true } : { ok: false, error: data.description || `HTTP ${res.status}` };
  } catch (err) { return { ok: false, error: err.message }; }
}

/** Publica el menú nativo de comandos del bot. Es best-effort y nunca expone el token. */
async function setCommands({ token, commands }) {
  if (!isConfigured(token) || !Array.isArray(commands) || !commands.length) return { ok: false, skipped: true };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}/bot${token}/setMyCommands`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commands }), signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok !== true) return { ok: false, status: res.status, error: data.description || `HTTP ${res.status}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.name === 'AbortError' ? `timeout ${TIMEOUT_MS}ms` : err.message };
  } finally { clearTimeout(timer); }
}

async function callBotApi({ token, method, body = {}, timeoutMs = TIMEOUT_MS }) {
  if (!isConfigured(token)) return { ok: false, error: 'Bot no configurado', definite: true };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE_URL}/bot${token}/${method}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok !== true) return { ok: false, status: res.status, error: data.description || `HTTP ${res.status}`, definite: true };
    return { ok: true, result: data.result };
  } catch (error) {
    return { ok: false, error: error.name === 'AbortError' ? `timeout ${timeoutMs}ms` : error.message, ambiguous: true };
  } finally { clearTimeout(timer); }
}

const getChat = ({ token, chatId }) => callBotApi({ token, method: 'getChat', body: { chat_id: chatId } });
const getChatMember = ({ token, chatId, userId }) => callBotApi({ token, method: 'getChatMember', body: { chat_id: chatId, user_id: userId } });
const createForumTopic = ({ token, chatId, name }) => callBotApi({ token, method: 'createForumTopic', body: { chat_id: chatId, name } });
const closeForumTopic = ({ token, chatId, threadId }) => callBotApi({ token, method: 'closeForumTopic', body: { chat_id: chatId, message_thread_id: Number(threadId) } });
const reopenForumTopic = ({ token, chatId, threadId }) => callBotApi({ token, method: 'reopenForumTopic', body: { chat_id: chatId, message_thread_id: Number(threadId) } });
const deleteForumTopic = ({ token, chatId, threadId }) => callBotApi({ token, method: 'deleteForumTopic', body: { chat_id: chatId, message_thread_id: Number(threadId) } });
const createChatInviteLink = ({ token, chatId, name, expiresAt }) => callBotApi({ token, method: 'createChatInviteLink', body: { chat_id: chatId, name, expire_date: Math.floor(expiresAt / 1000), creates_join_request: true } });
const revokeChatInviteLink = ({ token, chatId, inviteLink }) => callBotApi({ token, method: 'revokeChatInviteLink', body: { chat_id: chatId, invite_link: inviteLink } });
const approveChatJoinRequest = ({ token, chatId, userId }) => callBotApi({ token, method: 'approveChatJoinRequest', body: { chat_id: chatId, user_id: userId } });
const declineChatJoinRequest = ({ token, chatId, userId }) => callBotApi({ token, method: 'declineChatJoinRequest', body: { chat_id: chatId, user_id: userId } });
const banChatMember = ({ token, chatId, userId }) => callBotApi({ token, method: 'banChatMember', body: { chat_id: chatId, user_id: userId, revoke_messages: false } });
const unbanChatMember = ({ token, chatId, userId }) => callBotApi({ token, method: 'unbanChatMember', body: { chat_id: chatId, user_id: userId, only_if_banned: true } });

module.exports = { sendMessage, answerCallbackQuery, setCommands, callBotApi, getChat, getChatMember, createForumTopic, closeForumTopic, reopenForumTopic, deleteForumTopic, createChatInviteLink, revokeChatInviteLink, approveChatJoinRequest, declineChatJoinRequest, banChatMember, unbanChatMember, isConfigured, getBotUsername };
