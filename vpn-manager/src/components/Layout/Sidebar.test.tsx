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
  useWorkspaceSession: () => ({ session: { role: 'OWNER', name: 'Fernando Díaz', email: 'fernando@example.com' } }),
}));

vi.mock('../../utils/permissions', () => ({
  visibleModules: () => ['nodes', 'devices', 'team', 'monitor', 'client-history', 'settings'],
  roleLabel: () => 'Moderador',
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
    markNavigationStart.mockClear();
    setActiveModule.mockClear();

    await user.click(screen.getByRole('button', { name: 'Sitios' }));
    expect(markNavigationStart).toHaveBeenCalledWith('nodes');
    expect(setActiveModule).toHaveBeenCalledWith('nodes');
    expect(markNavigationStart.mock.invocationCallOrder[0])
      .toBeLessThan(setActiveModule.mock.invocationCallOrder[0]);
  });

  it('simplifica categorías, estados y controles del moderador', () => {
    render(<Sidebar />);

    expect(screen.getByText('Operación')).toBeInTheDocument();
    expect(screen.getByText('Cuenta')).toBeInTheDocument();
    expect(screen.queryByText('Red')).not.toBeInTheDocument();
    expect(screen.queryByText('Acceso')).not.toBeInTheDocument();
    expect(screen.queryByText('Monitoreo')).not.toBeInTheDocument();
    expect(screen.queryByText('Sistema')).not.toBeInTheDocument();
    expect(screen.queryByText('Servicio disponible')).not.toBeInTheDocument();
    expect(screen.queryByText('Conexión principal')).not.toBeInTheDocument();
    expect(screen.queryByText('Todo funciona correctamente')).not.toBeInTheDocument();
    expect(screen.queryByText('Tema oscuro')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Activar modo oscuro' })).toBeInTheDocument();
    expect(screen.getByText('Fernando Díaz')).toBeInTheDocument();
    expect(screen.getByText('Moderador')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Historial de clientes' })).toBeInTheDocument();
  });
});
