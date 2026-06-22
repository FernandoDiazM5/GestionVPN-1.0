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

function isConfigured() {
  return !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_TOKEN.includes(':'));
}

// Cache del username del bot. undefined = no consultado · null = desconocido · string = ok.
let _cachedUsername;

/**
 * Devuelve el @username del bot (sin la @) para construir `https://t.me/<user>`.
 * Prioriza TELEGRAM_BOT_USERNAME (sin red); si no, lo resuelve una vez con
 * getMe y lo cachea. Nunca lanza: ante fallo devuelve null y el frontend
 * degrada (muestra el código sin enlace directo al bot).
 * @returns {Promise<string|null>}
 */
async function getBotUsername() {
  const envName = process.env.TELEGRAM_BOT_USERNAME;
  if (envName) return envName.replace(/^@/, '');
  if (!isConfigured()) return null;
  if (_cachedUsername !== undefined) return _cachedUsername;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}/bot${process.env.TELEGRAM_BOT_TOKEN}/getMe`, { signal: controller.signal });
    const data = await res.json().catch(() => ({}));
    _cachedUsername = (data.ok && data.result && data.result.username) ? data.result.username : null;
  } catch (err) {
    log.debug({ err: err.message }, 'getMe falló — username de bot desconocido');
    _cachedUsername = null;
  } finally {
    clearTimeout(timer);
  }
  return _cachedUsername;
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
async function sendMessage({ chatId, text, html = true }) {
  if (!isConfigured()) {
    log.debug({ chatId }, 'sendMessage skipped — TELEGRAM_BOT_TOKEN no configurado');
    return { ok: false, skipped: true };
  }
  if (!chatId || !text) return { ok: false, error: 'chatId y text requeridos' };

  const url = `${BASE_URL}/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  const body = {
    chat_id: chatId,
    text: String(text).slice(0, 4000), // Telegram límite 4096; deja margen
    ...(html ? { parse_mode: 'HTML' } : {}),
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

module.exports = { sendMessage, isConfigured, getBotUsername };
