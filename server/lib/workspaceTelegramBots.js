const log = require('./logger').child({ scope: 'workspace-telegram-bots' });
const integrations = require('./workspaceIntegrationService');
const notificationRepo = require('../db/repos/notificationRepo');
const telegram = require('./telegram');
const crypto = require('crypto');

const bots = new Map();
let enabled = true;

async function reply(botToken, chatId, text) {
  return telegram.sendMessage({ token: botToken, chatId, text, html: true });
}

async function handleMessage(bot, message) {
  const chatId = message?.chat?.id;
  const text = String(message?.text || '').trim();
  if (!chatId || !text.startsWith('/')) return;
  const [rawCommand, rawCode] = text.split(/\s+/, 2);
  const command = rawCommand.toLowerCase().split('@')[0];
  if (command === '/start') return reply(bot.botToken, chatId, '<b>Joinpoint NOC</b>\nGenera tu código desde Ajustes → Notificaciones y envía <code>/link CÓDIGO</code>.');
  if (command !== '/link') return reply(bot.botToken, chatId, 'Este bot gestiona avisos del workspace. Usa <code>/link CÓDIGO</code> para vincularte.');
  const code = String(rawCode || '').trim().toUpperCase();
  if (!/^[A-F0-9]{6}$/.test(code)) return reply(bot.botToken, chatId, 'Código inválido. Usa <code>/link CÓDIGO</code>.');
  const botFingerprint = crypto.createHash('sha256').update(bot.botToken).digest('hex');
  const result = await notificationRepo.confirmTelegramLink({ code, chatId, workspaceId: bot.workspaceId, botFingerprint });
  return reply(bot.botToken, chatId, result.ok ? '✅ Telegram vinculado. Vuelve al panel para activar el canal.' : `❌ ${result.error}`);
}

async function poll(bot) {
  while (enabled && !bot.controller.signal.aborted) {
    try {
      const url = `https://api.telegram.org/bot${bot.botToken}/getUpdates?timeout=20&offset=${bot.offset}&allowed_updates=${encodeURIComponent('["message"]')}`;
      const response = await fetch(url, { signal: bot.controller.signal });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body.ok !== true) throw new Error(body.description || `HTTP ${response.status}`);
      for (const update of body.result || []) {
        bot.offset = update.update_id + 1;
        if (update.message) await handleMessage(bot, update.message);
      }
    } catch (error) {
      if (error.name === 'AbortError') return;
      log.warn({ workspaceId: bot.workspaceId, error: error.message }, 'Fallo temporal consultando bot del workspace');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
}

async function refresh() {
  for (const bot of bots.values()) bot.controller.abort();
  bots.clear();
  if (!enabled || process.env.TELEGRAM_BOT_ENABLED === 'false') return;
  const configured = await integrations.listActiveTelegramBots();
  for (const item of configured) {
    const controller = new AbortController();
    const bot = { ...item, controller, offset: 0 };
    bots.set(item.workspaceId, bot);
    void poll(bot);
  }
  log.info({ count: bots.size }, 'Bots Telegram de workspace activos');
}

function start() { enabled = true; return refresh(); }
function stop() { enabled = false; for (const bot of bots.values()) bot.controller.abort(); bots.clear(); }

module.exports = { start, stop, refresh, handleMessage, _bots: bots };
