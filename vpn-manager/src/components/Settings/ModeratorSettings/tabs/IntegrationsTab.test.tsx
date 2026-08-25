import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ list: vi.fn(), save: vi.fn(), test: vi.fn(), remove: vi.fn() }));
vi.mock('../../../../services/integrationsApi', () => ({ integrationsApi: api, platformIntegrationsApi: api }));
import IntegrationsTab from './IntegrationsTab';

const empty = ['BREVO', 'GMAIL', 'TELEGRAM', 'GEMINI'].map(provider => ({ provider, configured: false, active: false, status: 'NOT_CONFIGURED', label: null, metadata: {}, lastValidatedAt: null, updatedAt: null }));

beforeEach(() => { vi.clearAllMocks(); api.list.mockResolvedValue({ integrations: empty }); });

describe('IntegrationsTab', () => {
  it('muestra los cuatro proveedores y explica que los secretos quedan ocultos', async () => {
    render(<IntegrationsTab />);
    expect(await screen.findByText('Brevo')).toBeInTheDocument();
    expect(screen.getByText('Gmail')).toBeInTheDocument();
    expect(screen.getByText('Telegram Bot')).toBeInTheDocument();
    expect(screen.getByText('Google Gemini')).toBeInTheDocument();
    expect(screen.getByText(/nunca volvemos a mostrarla/i)).toBeInTheDocument();
    expect(screen.queryByLabelText('Gemini API Key')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { expanded: false })).toHaveLength(4);
  });

  it('mantiene una sola integración desplegada', async () => {
    const user = userEvent.setup();
    render(<IntegrationsTab />);
    await user.click(await screen.findByRole('button', { name: /Brevo/ }));
    expect(screen.getByLabelText('Usuario SMTP de Brevo')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Telegram Bot/ }));
    expect(screen.queryByLabelText('Usuario SMTP de Brevo')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Bot Token')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Abrir BotFather/ })).toBeInTheDocument();
  });

  it('envía la credencial nueva y después limpia el formulario', async () => {
    const user = userEvent.setup();
    api.save.mockResolvedValue({ integration: { ...empty[3], configured: true, active: true, status: 'ACTIVE', label: 'gemini-3.1-flash-lite', lastValidatedAt: Date.now() } });
    render(<IntegrationsTab />);
    await user.click(await screen.findByRole('button', { name: /Google Gemini/ }));
    await user.type(screen.getByLabelText('Gemini API Key'), 'AIza-valid-key-for-testing-12345');
    await user.click(screen.getByRole('button', { name: 'Validar y activar' }));
    await waitFor(() => expect(api.save).toHaveBeenCalledWith('GEMINI', expect.objectContaining({ apiKey: 'AIza-valid-key-for-testing-12345' })));
    expect(await screen.findByText(/ya no puede visualizarse/i)).toBeInTheDocument();
  });
});
