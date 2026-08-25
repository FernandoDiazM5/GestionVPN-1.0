import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ getNotifications: vi.fn(), updateNotifications: vi.fn(), startTelegramLink: vi.fn(), unlinkTelegram: vi.fn() }));
vi.mock('../../../../services/accountApi', () => ({ accountApi: api }));
import NotificationsTab from './NotificationsTab';

const unavailable = {
  channels: { email: false, telegram: false }, eventTypes: ['TUNNEL_ACTIVATED'], paused: false,
  telegramLinked: false, telegramBotConfigured: false, telegramBotUsername: null,
  channelAvailability: {
    email: { available: false, configured: false, verified: true, provider: null, reason: 'Configura Brevo o Gmail en Integraciones.' },
    telegram: { available: false, configured: false, username: null, reason: 'Configura y valida un Telegram Bot Token en Integraciones.' },
  },
};

beforeEach(() => { vi.clearAllMocks(); api.getNotifications.mockResolvedValue(unavailable); });

describe('NotificationsTab availability', () => {
  it('no presenta canales como activos antes de configurar las integraciones', async () => {
    const openIntegrations = vi.fn();
    const user = userEvent.setup();
    render(<NotificationsTab onOpenIntegrations={openIntegrations} />);
    expect(await screen.findByText('Sin canales activos')).toBeInTheDocument();
    expect(screen.getByText(/Configura Brevo o Gmail/)).toBeInTheDocument();
    expect(screen.getByText(/Telegram Bot Token/)).toBeInTheDocument();
    const checks = screen.getAllByRole('checkbox');
    expect(checks[0]).toBeDisabled();
    expect(checks[1]).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Vincular email' }));
    expect(openIntegrations).toHaveBeenCalledWith('email');
  });

  it('muestra los comandos operativos cuando Telegram está vinculado', async () => {
    api.getNotifications.mockResolvedValue({ ...unavailable, telegramLinked: true, telegramBotConfigured: true, channels: { email: false, telegram: false }, telegramBotUsername: 'workspace_bot', channelAvailability: { ...unavailable.channelAvailability, telegram: { available: true, configured: true, username: 'workspace_bot', reason: null } } });
    render(<NotificationsTab />);
    expect(await screen.findByText('Comandos disponibles en Telegram')).toBeInTheDocument();
    expect(screen.getByText('/estado')).toBeInTheDocument();
    expect(screen.getByText('/sitios')).toBeInTheDocument();
    expect(screen.getByText('/activar')).toBeInTheDocument();
    expect(screen.getByText('/desactivar')).toBeInTheDocument();
  });

  it('permite generar código sólo cuando el bot está configurado, pero no activa el checkbox', async () => {
    const user = userEvent.setup();
    api.getNotifications.mockResolvedValue({ ...unavailable, telegramBotConfigured: true, channelAvailability: { ...unavailable.channelAvailability, telegram: { available: true, configured: true, username: 'workspace_bot', reason: null } } });
    api.startTelegramLink.mockResolvedValue({ success: true, code: 'ABC123', expiresAt: Date.now() + 60000, botUsername: 'workspace_bot' });
    render(<NotificationsTab />);
    await user.click(await screen.findByRole('button', { name: 'Vincular cuenta' }));
    expect(await screen.findByText('/link ABC123')).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')[1]).toBeDisabled();
  });
});
