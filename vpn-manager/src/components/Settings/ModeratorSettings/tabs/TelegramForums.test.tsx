import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const api = vi.hoisted(() => ({ listTelegramForums: vi.fn(), createTelegramForumLink: vi.fn(), listTelegramForumTopics: vi.fn(), listTelegramForumParticipants: vi.fn(), previewTelegramForumTopic: vi.fn(), createTelegramForumTopic: vi.fn(), reconcileTelegramForum: vi.fn(), inviteTelegramForumParticipant: vi.fn(), removeTelegramForumParticipant: vi.fn(), reinstateTelegramForumParticipant: vi.fn(), latestBulkTopics: vi.fn(), previewBulkTopics: vi.fn(), startBulkTopics: vi.fn(), getBulkTopics: vi.fn(), pauseBulkTopics: vi.fn(), resumeBulkTopics: vi.fn(), listFiberRoutes: vi.fn(), getFiberRoute: vi.fn(), createFiberRoute: vi.fn(), addFiberElement: vi.fn(), addFiberMeasurement: vi.fn() }));
vi.mock('../../../../services/integrationsApi', () => ({ integrationsApi: api }));
import TelegramForums from './TelegramForums';

beforeEach(() => {
  vi.clearAllMocks();
  api.listTelegramForums.mockResolvedValue({ groups: [] });
  api.listTelegramForumTopics.mockResolvedValue({ topics: [] });
  api.listTelegramForumParticipants.mockResolvedValue({ participants: [] });
  api.latestBulkTopics.mockResolvedValue({ job: null });
  api.listFiberRoutes.mockResolvedValue({ routes: [] });
});

describe('TelegramForums', () => {
  it('prioriza grupos, métricas y el asistente de nuevo grupo', async () => {
    const user = userEvent.setup();
    render(<TelegramForums standalone />);
    expect(await screen.findByText(/Todavía no hay grupos/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Grupos operativos' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Grupos' })).toBeInTheDocument();
    expect(screen.getByText('Grupos activos')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Nuevo grupo/ }));
    expect(screen.getByRole('dialog', { name: 'Vincular grupo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Rutas de fibra/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(screen.getByRole('button', { name: /Generar código/ })).toBeInTheDocument();
  });

  it('genera el comando de vinculación con vencimiento', async () => {
    const user = userEvent.setup();
    api.createTelegramForumLink.mockResolvedValue({ link: { id: 'g-1', code: 'A1B2C3D4', command: '/vinculargrupo A1B2C3D4', expiresAt: Date.now() + 60_000 } });
    render(<TelegramForums standalone />);
    await user.click(await screen.findByRole('button', { name: /Nuevo grupo/ }));
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    await user.click(screen.getByRole('button', { name: /Generar código/ }));
    await waitFor(() => expect(api.createTelegramForumLink).toHaveBeenCalledWith('CLIENT_TRACKING'));
    expect(screen.getByText('/vinculargrupo A1B2C3D4')).toBeInTheDocument();
  });

  it('verifica el grupo y muestra temas eliminados directamente en Telegram', async () => {
    const user = userEvent.setup();
    const group = { id: 'g-1', chatId: '-1001', name: 'Clientes', status: 'ACTIVE', profileType: 'CLIENT_TRACKING', capabilities: ['CLIENT_QUERIES', 'CLIENT_TOPICS', 'PARTICIPANT_MANAGEMENT'], missingPermissions: [], linkedAt: 1, createdAt: 1 };
    api.listTelegramForums.mockResolvedValue({ groups: [group] });
    api.reconcileTelegramForum.mockResolvedValue({ group, deletedTopics: 1 });
    api.listTelegramForumTopics.mockResolvedValue({ topics: [{ id: 't-1', groupId: 'g-1', clientId: '14', clientName: 'Ana', name: '14 · Ana', threadId: '77', status: 'DELETED', createdAt: 1, updatedAt: 2 }] });
    render(<TelegramForums standalone />);
    await screen.findByRole('heading', { name: 'Clientes' });
    await user.click(screen.getByRole('button', { name: 'Verificar con Telegram' }));
    expect(await screen.findByText(/1 tema\(s\) eliminados fueron detectados/)).toBeInTheDocument();
    expect(screen.getByText('Eliminado')).toBeInTheDocument();
  });

  it('muestra el perfil de rutas y permite iniciar una nueva ruta', async () => {
    const user = userEvent.setup();
    api.listTelegramForums.mockResolvedValue({ groups: [{ id: 'g-2', chatId: '-1002', name: 'Fibra', status: 'ACTIVE', profileType: 'FIBER_ROUTES', capabilities: ['FIBER_ROUTES'], missingPermissions: [], linkedAt: 1, createdAt: 1 }] });
    render(<TelegramForums standalone />);
    expect(await screen.findByRole('heading', { name: 'Fibra' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Nueva ruta/ }));
    expect(screen.getByRole('dialog', { name: 'Nueva ruta' })).toBeInTheDocument();
  });
});
