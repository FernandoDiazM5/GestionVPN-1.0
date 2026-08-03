import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import NodesTable from './NodesTable';

describe('NodesTable accessibility', () => {
  it('activa la ordenación con teclado y anuncia la dirección', async () => {
    const user = userEvent.setup();
    const onSort = vi.fn();
    render(
      <NodesTable
        nodes={[]}
        nodeTags={{}}
        searchQuery=""
        sortKey="nombre_nodo"
        sortDir="desc"
        onSort={onSort}
        onEditNode={vi.fn()}
        onDeleteNode={vi.fn()}
        onScriptNode={vi.fn()}
        onRenameNode={vi.fn()}
        onHistoryNode={vi.fn()}
        onTagClick={vi.fn()}
        onDiagnoseNode={vi.fn()}
        visibleCols={['disabled', 'tags', 'vrf', 'ip_tunnel', 'lan']}
      />,
    );

    expect(screen.getByRole('region', { name: /sitios remotos/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /^sitio$/i })).toHaveAttribute('aria-sort', 'descending');
    expect(screen.getByRole('columnheader', { name: 'Disponibilidad' })).not.toHaveClass('uppercase');
    expect(screen.getByRole('columnheader', { name: 'Etiquetas' })).not.toHaveClass('uppercase');
    expect(screen.getByRole('columnheader', { name: 'Ruta asignada' })).not.toHaveClass('uppercase');
    expect(screen.getByRole('columnheader', { name: 'Dirección de conexión' })).not.toHaveClass('uppercase');
    expect(screen.getByRole('columnheader', { name: 'Red del sitio' })).not.toHaveClass('uppercase');
    expect(screen.getByRole('columnheader', { name: 'Opciones' })).toHaveClass(
      'bg-slate-50',
      'dark:bg-slate-800',
      'border-l',
    );

    const sortButton = screen.getByRole('button', { name: /ordenar por sitio ascendente/i });
    sortButton.focus();
    await user.keyboard('{Enter}');
    expect(onSort).toHaveBeenCalledWith('nombre_nodo');
  });
});
