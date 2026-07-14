import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TeamModule from './TeamModule';
import { teamApi } from '../../../services/teamApi';

vi.mock('../../../context/WorkspaceSession', () => ({
  useWorkspaceSession: () => ({
    session: {
      id: 'owner-1', email: 'owner@example.com', name: 'Owner', role: 'OWNER',
      platform_admin: false, workspace_name: 'Pruebas',
    },
    loading: false,
    refresh: vi.fn(),
  }),
}));
vi.mock('../../../hooks/useWorkspaceEvents', () => ({ useWorkspaceEvents: vi.fn() }));
vi.mock('../../../services/auditApi', () => ({
  auditApi: { listLogs: vi.fn().mockResolvedValue({ logs: [] }) },
}));
vi.mock('../../../services/teamApi', () => ({
  teamApi: {
    listMembers: vi.fn(),
    listInvitations: vi.fn().mockResolvedValue({ invitations: [] }),
    invite: vi.fn(), revokeInvitation: vi.fn(), removeMember: vi.fn(), setMemberDisabled: vi.fn(),
  },
}));
vi.mock('./components/MyInvitationsInbox', () => ({ default: () => null }));
vi.mock('./components/InvitePanel', () => ({ default: () => <div>Invitaciones</div> }));
vi.mock('./components/MembersTable', () => ({ default: () => <div>Miembros</div> }));
vi.mock('./components/AuditTimeline', () => ({ default: () => <div>Actividad</div> }));

describe('TeamModule', () => {
  beforeEach(() => {
    vi.mocked(teamApi.listMembers).mockRejectedValue(new Error('offline'));
  });

  it('distingue un fallo de API de un workspace vacio', async () => {
    render(<TeamModule />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('No se pudieron cargar los miembros del workspace');
    });
    expect(screen.getByText('Miembros')).toBeInTheDocument();
  });
});
