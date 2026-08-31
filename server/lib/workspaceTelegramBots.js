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
  { command: 'misitio', description: 'Ver sitio activo y tiempo restante' },
  { command: 'sitios', description: 'Listar tus sitios disponibles' },
  { command: 'activar', description: 'Elegir y abrir acceso a un sitio' },
  { command: 'desactivar', description: 'Cerrar tu acceso actual' },
  { command: 'cancelar', description: 'Cancelar una selección pendiente' },
  { command: 'unlink', description: 'Desvincular este chat' },
  { command: 'vinculargrupo', description: 'Vincular un supergrupo con código' },
  { command: 'registrartema', description: 'Registrar el tema actual para un cliente' },
  { command: 'informacion', description: 'Datos actuales del cliente del tema' },
  { command: 'servicios', description: 'Servicios actuales del cliente del tema' },
  { command: 'facturacion', description: 'Facturación actual del cliente del tema' },
  { command: 'ayuda', description: 'Ayuda de consultas dentro del tema' },
  { command: 'resumenruta', description: 'Ver trazado registrado de la ruta' },
  { command: 'agregartramo', description: 'Agregar un tramo de fibra' },
  { command: 'agregarmufa', description: 'Agregar una mufa y su fusión' },
  { command: 'fusion', description: 'Registrar continuidad entre hilos' },
  { command: 'potencia', description: 'Registrar una medición óptica' },
  { command: 'evidencia', description: 'Registrar nota o fotografía' },
  { command: 'cerrarruta', description: 'Marcar la ruta como operativa' },
  { command: 'ayudaruta', description: 'Ayuda para rutas de fibra' },
];

async function handleMessage(bot, message) {
  return telegramBot.handleWorkspaceMessage(bot, message);
}

async function handleCallback(bot, callback) {
  return telegramBot.handleWorkspaceCallback(bot, callback);
}

async function poll(bot) {
  while (enabled && !bot.controller.signal.aborted) {
    try {
      const url = `https://api.telegram.org/bot${bot.botToken}/getUpdates?timeout=20&offset=${bot.offset}&allowed_updates=${encodeURIComponent('["message","callback_query","chat_join_request","chat_member","my_chat_member"]')}`;
      const response = await fetch(url, { signal: bot.controller.signal });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body.ok !== true) throw new Error(body.description || `HTTP ${response.status}`);
      for (const update of body.result || []) {
        bot.offset = update.update_id + 1;
        if (update.message) await handleMessage(bot, update.message);
        if (update.callback_query) await handleCallback(bot, update.callback_query);
        if (update.chat_join_request || update.chat_member) await require('./telegramForumService').reconcileParticipantUpdate({ workspaceId: bot.workspaceId, botToken: bot.botToken, update });
        if (update.my_chat_member) await require('./telegramForumService').reconcileBotMembership({ workspaceId: bot.workspaceId, update });
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

module.exports = { start, stop, refresh, handleMessage, handleCallback, _bots: bots };
