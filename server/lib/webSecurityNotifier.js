const notificationRepo = require('../db/repos/notificationRepo');
const telegram = require('./telegram');
const log = require('./logger').child({ scope: 'web-security-notifier' });

const escapeHtml = (value) => String(value).replace(/[&<>]/g,
  (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[char]);

async function notifyAutomaticAction({ status, sourceIp, recommendation, jail, detail }) {
  try {
    const admins = await notificationRepo.listPlatformAdminsWithTelegram();
    const unique = [...new Map(admins.map((row) => [String(row.telegram_chat_id), row])).values()];
    const text = `<b>Protección web automática</b>\nEstado: <code>${escapeHtml(status)}</code>`
      + `\nIP: <code>${escapeHtml(sourceIp)}</code>\nProtección: <code>${escapeHtml(jail)}</code>`
      + `\nSeñal: <code>${escapeHtml(recommendation)}</code>`;
    const results = await Promise.all(unique.map(async (admin) => {
      const result = await telegram.sendMessage({ chatId: admin.telegram_chat_id, text });
      await notificationRepo.log({ userId: admin.user_id, event: 'WEB_SECURITY_AUTOMATIC',
        channel: 'telegram', status: result?.ok ? 'sent' : 'failed',
        detail: JSON.stringify({ sourceIp, recommendation, jail, status, code: detail?.code || null }) });
      return result;
    }));
    return { recipients: unique.length, sent: results.filter((item) => item?.ok).length };
  } catch (error) {
    log.warn({ code: error?.code || 'UNKNOWN' }, 'Notificación automática de seguridad falló');
    return { recipients: 0, sent: 0, error: error?.code || 'UNKNOWN' };
  }
}

module.exports = { notifyAutomaticAction };
