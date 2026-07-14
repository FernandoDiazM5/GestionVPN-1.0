import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import Sidebar from './Sidebar';

vi.mock('../../context', () => ({
  useVpn: () => ({
    activeModule: 'dashboard',
    setActiveModule: vi.fn(),
    credentials: { user: 'owner', role: 'OWNER' },
    handleLogout: vi.fn(),
    darkMode: false,
    toggleDarkMode: vi.fn(),
  }),
}));

vi.mock('../../context/WorkspaceSession', () => ({
  useWorkspaceSession: () => ({ session: { role: 'OWNER' } }),
}));

vi.mock('../../utils/permissions', () => ({
  visibleModules: () => ['dashboard', 'nodes', 'devices', 'team', 'monitor', 'settings'],
  roleLabel: () => 'Propietario',
}));

describe('<Sidebar /> móvil', () => {
  it('abre un drawer accesible, cierra con Escape y restaura el foco', async () => {
    const user = userEvent.setup();
    render(<Sidebar />);
    const trigger = screen.getByRole('button', { name: 'Abrir menú' });

    await user.click(trigger);
    expect(screen.getByRole('dialog', { name: 'Navegación principal' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cerrar menú' })).toHaveFocus());

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Navegación principal' })).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});
