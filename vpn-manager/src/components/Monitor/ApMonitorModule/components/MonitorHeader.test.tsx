import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import MonitorHeader from './MonitorHeader';

const baseProps = {
  nodeCount: 2,
  apCount: 3,
  cpeCount: 4,
  nodeFilter: 'active' as const,
  search: '',
  connectionStatus: 'connected' as const,
  lastPolledAt: 0,
  canSync: true,
  syncing: false,
  reloading: false,
  onFilterChange: vi.fn(),
  onSearchChange: vi.fn(),
  onSync: vi.fn(),
  onReload: vi.fn(),
};

describe('MonitorHeader', () => {
  it('presenta la jerarquía, las métricas y el estado de actualización en español', () => {
    render(<MonitorHeader {...baseProps} />);

    expect(screen.getByRole('heading', { name: 'Monitor de APs' })).toBeInTheDocument();
    expect(screen.getByText('Supervisa en tiempo real los AP agrupados por nodo.')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Actualización en vivo');
    expect(screen.getByText('2 nodos')).toBeInTheDocument();
    expect(screen.getByText('3 AP')).toBeInTheDocument();
    expect(screen.getByText('4 CPE conectados')).toBeInTheDocument();
    expect(screen.queryByText(/CPEs live/i)).not.toBeInTheDocument();
  });

  it('expone filtros, búsqueda y acciones con estados accesibles', async () => {
    const user = userEvent.setup();
    const onFilterChange = vi.fn();
    const onSearchChange = vi.fn();
    const onSync = vi.fn();
    const onReload = vi.fn();

    const { rerender } = render(
      <MonitorHeader
        {...baseProps}
        onFilterChange={onFilterChange}
        onSearchChange={onSearchChange}
        onSync={onSync}
        onReload={onReload}
      />,
    );

    expect(screen.getByRole('button', { name: 'Activos' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Inactivos' })).toHaveAttribute('aria-pressed', 'false');

    await user.click(screen.getByRole('button', { name: 'Inactivos' }));
    expect(onFilterChange).toHaveBeenCalledWith('inactive');

    await user.type(screen.getByRole('searchbox', { name: /buscar AP por nombre/i }), 'torre');
    expect(onSearchChange).toHaveBeenLastCalledWith('e');

    await user.click(screen.getByRole('button', { name: 'Sincronizar AP' }));
    expect(onSync).toHaveBeenCalledOnce();

    await user.click(screen.getByRole('button', { name: 'Recargar equipos guardados' }));
    expect(onReload).toHaveBeenCalledOnce();

    rerender(
      <MonitorHeader
        {...baseProps}
        search="torre"
        canSync={false}
        onFilterChange={onFilterChange}
        onSearchChange={onSearchChange}
        onSync={onSync}
        onReload={onReload}
      />,
    );

    expect(screen.getByRole('button', { name: 'Sincronizar AP' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Limpiar búsqueda' }));
    expect(onSearchChange).toHaveBeenLastCalledWith('');
  });
});
