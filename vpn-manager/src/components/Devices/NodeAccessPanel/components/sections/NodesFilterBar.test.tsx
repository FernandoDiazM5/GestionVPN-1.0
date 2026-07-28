import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import NodesFilterBar from './NodesFilterBar';

describe('<NodesFilterBar />', () => {
  it('compacta controles y conserva la personalización de columnas', () => {
    render(
      <NodesFilterBar
        search=""
        onSearchChange={vi.fn()}
        filterProtocol=""
        setFilterProtocol={vi.fn()}
        filterStatus=""
        setFilterStatus={vi.fn()}
        visibleCols={['disabled']}
        setVisibleCols={vi.fn()}
        exportSlot={<button>Descargar</button>}
        resultCount={1}
        totalCount={1}
      />,
    );

    expect(screen.getByPlaceholderText('Buscar por nombre o ubicación…')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Conexión: todas' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Estado: todos' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Columnas 1/ })).toHaveAttribute('aria-haspopup', 'menu');
    expect(screen.getByText('1 sitio')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Descargar' })).toBeInTheDocument();
  });

  it('muestra el contador filtrado sin ocultar el total', () => {
    render(
      <NodesFilterBar
        search="torre"
        onSearchChange={vi.fn()}
        filterProtocol=""
        setFilterProtocol={vi.fn()}
        filterStatus=""
        setFilterStatus={vi.fn()}
        visibleCols={[]}
        setVisibleCols={vi.fn()}
        resultCount={1}
        totalCount={8}
      />,
    );

    expect(screen.getByText('1 de 8 sitios')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Quitar búsqueda "torre"' })).toBeInTheDocument();
  });
});
