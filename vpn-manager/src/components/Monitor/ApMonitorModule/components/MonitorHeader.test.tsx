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

    expect(screen.getByRole('heading', { name: 'Estado de equipos' })).toBeInTheDocument();
    expect(screen.getByText('Revisa el estado de los equipos de red conectados en cada sitio.')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Actualización en tiempo real');
    expect(screen.getByLabelText('2 sitios, 3 equipos de red, 4 clientes conectados')).toHaveTextContent('2Sitios3Equipos4Clientes');
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

    expect(screen.getByRole('combobox', { name: 'Filtrar equipos por sitio' })).toHaveValue('active');

    await user.selectOptions(screen.getByRole('combobox', { name: 'Filtrar equipos por sitio' }), 'inactive');
    expect(onFilterChange).toHaveBeenCalledWith('inactive');

    await user.type(screen.getByRole('searchbox', { name: /buscar equipos por nombre/i }), 'torre');
    expect(onSearchChange).toHaveBeenLastCalledWith('e');

    await user.click(screen.getByRole('button', { name: 'Actualizar equipos' }));
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

    expect(screen.getByRole('button', { name: 'Actualizar equipos' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Limpiar búsqueda' }));
    expect(onSearchChange).toHaveBeenLastCalledWith('');
  });

  it('mantiene disponible el filtro y deshabilita las acciones sin datos visibles', () => {
    render(<MonitorHeader {...baseProps} nodeCount={0} apCount={0} cpeCount={0} canSync={false} />);

    expect(screen.getByRole('combobox', { name: 'Filtrar equipos por sitio' })).toBeEnabled();
    expect(screen.getByRole('searchbox', { name: /buscar equipos por nombre/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Actualizar equipos' })).toBeDisabled();
    expect(screen.getByText('Selecciona “Otros sitios” o “Todos los sitios” para consultar equipos guardados.')).toBeInTheDocument();
    expect(screen.queryByText('En línea')).not.toBeInTheDocument();
  });
});
