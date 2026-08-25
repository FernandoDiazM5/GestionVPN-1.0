const log = require('./logger').child({ scope: 'workspace-telegram-bots' });
const integrations = require('./workspaceIntegrationService');
const telegramBot = require('./telegramBot');

const bots = new Map();
let enabled = true;
const WORKSPACE_COMMANDS = [
  { command: 'start', description: 'Bienvenida y estado de vinculación' },
  { command: 'help', description: 'Ver todos los comandos disponibles' },
  { command: 'link', description: 'Vincular este chat con un código' },
  { command: 'estado', description: 'Ver tu acceso activo' },
  { command: 'sitios', description: 'Listar tus sitios disponibles' },
  { command: 'activar', description: 'Elegir y abrir acceso a un sitio' },
  { command: 'desactivar', description: 'Cerrar tu acceso actual' },
  { command: 'cancelar', description: 'Cancelar una selección pendiente' },
  { command: 'unlink', description: 'Desvincular este chat' },
];

async function handleMessage(bot, message) {
  return telegramBot.handleWorkspaceMessage(bot, message);
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
    const menu = await require('./telegram').setCommands({ token: item.botToken, commands: WORKSPACE_COMMANDS });
    if (!menu.ok) log.warn({ workspaceId: item.workspaceId, error: menu.error }, 'No se pudo publicar el menú de comandos');
    void poll(bot);
  }
  log.info({ count: bots.size }, 'Bots Telegram de workspace activos');
}

function start() { enabled = true; return refresh(); }
function stop() { enabled = false; for (const bot of bots.values()) bot.controller.abort(); bots.clear(); }

module.exports = { start, stop, refresh, handleMessage, _bots: bots };
