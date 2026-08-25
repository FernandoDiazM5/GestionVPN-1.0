const userRepo = require('../db/repos/userRepo');
const workspaceIntegrations = require('./workspaceIntegrationService');
const platformIntegrations = require('./platformIntegrationService');
const { AppError } = require('./apiResponse');
const crypto = require('crypto');

function active(items, providers) {
  return items.find(item => providers.includes(item.provider) && item.configured && item.active && item.status === 'ACTIVE') || null;
}

async function getNotificationChannelAvailability(account) {
  const user = await userRepo.findById(account.sub);
  const platformAdmin = Boolean(account.platform_admin);
  const items = platformAdmin
    ? await platformIntegrations.list()
    : account.workspace_id ? await workspaceIntegrations.list(account.workspace_id) : [];
  const emailIntegration = active(items, ['BREVO', 'GMAIL']);
  const telegramIntegration = active(items, ['TELEGRAM']);
  const emailVerified = Number(user?.email_verified) === 1;
  return {
    email: {
      available: Boolean(emailIntegration && emailVerified && user?.email),
      configured: Boolean(emailIntegration),
      verified: emailVerified,
      provider: emailIntegration?.provider || null,
      reason: !emailIntegration ? 'Configura Brevo o Gmail en Integraciones.' : !emailVerified ? 'Verifica primero el correo de tu cuenta.' : !user?.email ? 'Tu cuenta no tiene un correo válido.' : null,
    },
    telegram: {
      available: Boolean(telegramIntegration),
      configured: Boolean(telegramIntegration),
      username: telegramIntegration?.metadata?.username || null,
      reason: telegramIntegration ? null : 'Configura y valida un Telegram Bot Token en Integraciones.',
    },
  };
}

async function getNotificationTelegramCredential(account) {
  const config = account.platform_admin
    ? await platformIntegrations.getSecret('TELEGRAM').catch(() => null)
    : account.workspace_id ? await workspaceIntegrations.getSecret(account.workspace_id, 'TELEGRAM').catch(() => null) : null;
  if (!config?.botToken) return null;
  return { botToken: config.botToken, fingerprint: crypto.createHash('sha256').update(config.botToken).digest('hex') };
}

function assertNotificationPreferences({ channels, paused, availability, telegramLinked }) {
  if (channels.email && !availability.email.available) throw new AppError(availability.email.reason, 422, 'EMAIL_CHANNEL_UNAVAILABLE');
  if (channels.telegram && (!availability.telegram.available || !telegramLinked)) {
    throw new AppError(!availability.telegram.available ? availability.telegram.reason : 'Completa la vinculación con el bot antes de activar Telegram.', 422, 'TELEGRAM_CHANNEL_UNAVAILABLE');
  }
  if (!paused && !channels.email && !channels.telegram) throw new AppError('Activa al menos un canal válido antes de reanudar las notificaciones.', 422, 'NOTIFICATION_CHANNEL_REQUIRED');
}

module.exports = { getNotificationChannelAvailability, getNotificationTelegramCredential, assertNotificationPreferences };
