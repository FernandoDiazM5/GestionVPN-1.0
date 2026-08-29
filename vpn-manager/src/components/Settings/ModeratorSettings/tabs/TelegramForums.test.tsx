import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const api = vi.hoisted(() => ({ listTelegramForums: vi.fn(), getMikrowispGuide: vi.fn(), createTelegramForumLink: vi.fn(), listTelegramForumTopics: vi.fn(), listTelegramForumParticipants: vi.fn(), previewTelegramForumTopic: vi.fn(), createTelegramForumTopic: vi.fn(), changeTelegramForumTopic: vi.fn(), inviteTelegramForumParticipant: vi.fn(), removeTelegramForumParticipant: vi.fn(), reinstateTelegramForumParticipant: vi.fn() }));
vi.mock('../../../../services/integrationsApi', () => ({ integrationsApi: api }));
import TelegramForums from './TelegramForums';

beforeEach(() => {
  vi.clearAllMocks();
  api.listTelegramForums.mockResolvedValue({ groups: [] });
  api.getMikrowispGuide.mockResolvedValue({ guide: null });
  api.listTelegramForumTopics.mockResolvedValue({ topics: [] });
  api.listTelegramForumParticipants.mockResolvedValue({ participants: [] });
});

describe('TelegramForums', () => {
  it('explica el flujo manual y que no almacena conversaciones', async () => {
    render(<TelegramForums />);
    expect(await screen.findByText(/Todavía no hay grupos vinculados/)).toBeInTheDocument();
    expect(screen.getByText(/no guarda conversaciones/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Vincular otro grupo/ })).toBeInTheDocument();
  });

  it('genera el comando de vinculación con vencimiento', async () => {
    const user = userEvent.setup();
    api.createTelegramForumLink.mockResolvedValue({ link: { id: 'g-1', code: 'A1B2C3D4', command: '/vinculargrupo A1B2C3D4', expiresAt: Date.now() + 60_000 } });
    render(<TelegramForums />);
    await user.click(await screen.findByRole('button', { name: /Vincular otro grupo/ }));
    await waitFor(() => expect(api.createTelegramForumLink).toHaveBeenCalledOnce());
    expect(screen.getByText('/vinculargrupo A1B2C3D4')).toBeInTheDocument();
  });
});
