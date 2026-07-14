import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import AsyncQueryState from './AsyncQueryState';

describe('AsyncQueryState', () => {
  it('muestra skeleton durante la carga', () => {
    render(<AsyncQueryState loading onRetry={vi.fn()}><p>Contenido</p></AsyncQueryState>);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByText('Contenido')).not.toBeInTheDocument();
  });

  it('muestra error y permite reintentar', async () => {
    const retry = vi.fn();
    render(<AsyncQueryState loading={false} error="Fallo de red" onRetry={retry}><p>Contenido</p></AsyncQueryState>);
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('distingue el estado vacio del estado de error', () => {
    render(<AsyncQueryState loading={false} empty onRetry={vi.fn()} emptyTitle="Sin eventos"><p>Contenido</p></AsyncQueryState>);
    expect(screen.getByText('Sin eventos')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
