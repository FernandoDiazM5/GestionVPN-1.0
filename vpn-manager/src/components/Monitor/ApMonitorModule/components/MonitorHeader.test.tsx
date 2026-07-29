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
  onFilterChange: vi.fn(),
  onSearchChange: vi.fn(),
  onSync: vi.fn(),
};

describe('MonitorHeader', () => {
  it('presenta la jerarquía, las métricas y el estado de actualización en español', () => {
    render(<MonitorHeader {...baseProps} />);

    expect(screen.getByRole('heading', { name: 'Estado de antenas' })).toBeInTheDocument();
    expect(screen.getByText('Revisa el estado de las antenas y equipos conectados en cada sitio.')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Actualización automática');
    expect(screen.getByText('2 sitios')).toBeInTheDocument();
    expect(screen.getByText('3 antenas')).toBeInTheDocument();
    expect(screen.getByText('4 clientes conectados')).toBeInTheDocument();
    expect(screen.queryByText(/CPEs live/i)).not.toBeInTheDocument();
  });

  it('expone filtros, búsqueda y acciones con estados accesibles', async () => {
    const user = userEvent.setup();
    const onFilterChange = vi.fn();
    const onSearchChange = vi.fn();
    const onSync = vi.fn();

    const { rerender } = render(
      <MonitorHeader
        {...baseProps}
        onFilterChange={onFilterChange}
        onSearchChange={onSearchChange}
        onSync={onSync}
      />,
    );

    expect(screen.getByRole('button', { name: 'Sitio conectado' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Otros sitios' })).toHaveAttribute('aria-pressed', 'false');

    await user.click(screen.getByRole('button', { name: 'Otros sitios' }));
    expect(onFilterChange).toHaveBeenCalledWith('inactive');

    await user.type(screen.getByRole('searchbox', { name: /buscar antena por nombre/i }), 'torre');
    expect(onSearchChange).toHaveBeenLastCalledWith('e');

    await user.click(screen.getByRole('button', { name: 'Actualizar información' }));
    expect(onSync).toHaveBeenCalledOnce();

    rerender(
      <MonitorHeader
        {...baseProps}
        search="torre"
        canSync={false}
        onFilterChange={onFilterChange}
        onSearchChange={onSearchChange}
        onSync={onSync}
      />,
    );

    expect(screen.getByRole('button', { name: 'Actualizar información' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Limpiar búsqueda' }));
    expect(onSearchChange).toHaveBeenLastCalledWith('');
  });
});
