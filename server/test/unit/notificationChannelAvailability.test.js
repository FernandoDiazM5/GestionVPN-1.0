import { beforeEach, describe, expect, it, vi } from 'vitest';
const { stubModule } = require('../helpers/moduleMock');

const userRepo = stubModule(__dirname, '../../db/repos/userRepo', { findById: vi.fn() });
const workspaceIntegrations = stubModule(__dirname, '../../lib/workspaceIntegrationService', { list: vi.fn() });
const platformIntegrations = stubModule(__dirname, '../../lib/platformIntegrationService', { list: vi.fn() });
const { getNotificationChannelAvailability, assertNotificationPreferences } = require('../../lib/notificationChannelAvailability');

beforeEach(() => {
  vi.clearAllMocks();
  userRepo.findById.mockResolvedValue({ id: 'u1', email: 'owner@example.com', email_verified: 1 });
  workspaceIntegrations.list.mockResolvedValue([]);
  platformIntegrations.list.mockResolvedValue([]);
});

describe('validación de preferencias', () => {
  const unavailable = {
    email: { available: false, reason: 'Configura Brevo o Gmail.' },
    telegram: { available: false, reason: 'Configura Telegram.' },
  };

  it('rechaza activar email sin SMTP propio', () => {
    expect(() => assertNotificationPreferences({ channels: { email: true, telegram: false }, paused: false, availability: unavailable, telegramLinked: false })).toThrowError(expect.objectContaining({ code: 'EMAIL_CHANNEL_UNAVAILABLE' }));
  });

  it('rechaza Telegram antes de confirmar el código', () => {
    const availability = { ...unavailable, telegram: { available: true, reason: null } };
    expect(() => assertNotificationPreferences({ channels: { email: false, telegram: true }, paused: false, availability, telegramLinked: false })).toThrowError(expect.objectContaining({ code: 'TELEGRAM_CHANNEL_UNAVAILABLE' }));
  });

  it('rechaza reanudar sin al menos un canal válido', () => {
    expect(() => assertNotificationPreferences({ channels: { email: false, telegram: false }, paused: false, availability: unavailable, telegramLinked: false })).toThrowError(expect.objectContaining({ code: 'NOTIFICATION_CHANNEL_REQUIRED' }));
  });
});

describe('disponibilidad de canales', () => {
  it('bloquea ambos canales cuando el workspace no ingresó integraciones', async () => {
    const result = await getNotificationChannelAvailability({ sub: 'u1', workspace_id: 'ws1', platform_admin: false });
    expect(result.email.available).toBe(false);
    expect(result.telegram.available).toBe(false);
    expect(result.email.reason).toContain('Brevo o Gmail');
    expect(result.telegram.reason).toContain('Telegram Bot Token');
  });

  it('exige correo verificado aunque Brevo esté activo', async () => {
    userRepo.findById.mockResolvedValue({ id: 'u1', email: 'owner@example.com', email_verified: 0 });
    workspaceIntegrations.list.mockResolvedValue([{ provider: 'BREVO', configured: true, active: true, status: 'ACTIVE', metadata: {} }]);
    const result = await getNotificationChannelAvailability({ sub: 'u1', workspace_id: 'ws1', platform_admin: false });
    expect(result.email.available).toBe(false);
    expect(result.email.reason).toContain('Verifica');
  });

  it('habilita únicamente integraciones activas del alcance correcto', async () => {
    workspaceIntegrations.list.mockResolvedValue([
      { provider: 'GMAIL', configured: true, active: true, status: 'ACTIVE', metadata: {} },
      { provider: 'TELEGRAM', configured: true, active: true, status: 'ACTIVE', metadata: { username: 'workspace_bot' } },
    ]);
    const result = await getNotificationChannelAvailability({ sub: 'u1', workspace_id: 'ws1', platform_admin: false });
    expect(result.email).toMatchObject({ available: true, provider: 'GMAIL' });
    expect(result.telegram).toMatchObject({ available: true, username: 'workspace_bot' });
    expect(platformIntegrations.list).not.toHaveBeenCalled();
  });
});
