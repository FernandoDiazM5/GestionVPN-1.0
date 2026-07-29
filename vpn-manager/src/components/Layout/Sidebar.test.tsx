import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import Sidebar from './Sidebar';

const { preloadModule, markNavigationStart, setActiveModule } = vi.hoisted(() => ({
  preloadModule: vi.fn(),
  markNavigationStart: vi.fn(),
  setActiveModule: vi.fn(),
}));

vi.mock('../../performance/moduleLoaders', () => ({ preloadModule }));
vi.mock('../../performance/navigationMetrics', () => ({ markNavigationStart }));

vi.mock('../../context', () => ({
  useVpn: () => ({
    activeModule: 'dashboard',
    setActiveModule,
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

  it('precarga únicamente módulos visibles por intención del usuario', async () => {
    const user = userEvent.setup();
    render(<Sidebar />);

    const devices = screen.getByRole('button', { name: 'Buscar equipos' });
    await user.hover(devices);
    expect(preloadModule).toHaveBeenCalledWith('devices', false);

    devices.focus();
    expect(preloadModule).toHaveBeenCalledWith('devices', false);
    expect(screen.queryByRole('button', { name: 'Moderadores' })).not.toBeInTheDocument();
  });

  it('mide la navegación antes de cambiar el módulo', async () => {
    const user = userEvent.setup();
    render(<Sidebar />);

    await user.click(screen.getByRole('button', { name: 'Sitios' }));
    expect(markNavigationStart).toHaveBeenCalledWith('nodes');
    expect(setActiveModule).toHaveBeenCalledWith('nodes');
    expect(markNavigationStart.mock.invocationCallOrder[0])
      .toBeLessThan(setActiveModule.mock.invocationCallOrder[0]);
  });
});
