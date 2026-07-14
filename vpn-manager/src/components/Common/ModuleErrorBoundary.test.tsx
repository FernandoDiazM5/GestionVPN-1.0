import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ModuleErrorBoundary from './ModuleErrorBoundary';

function BrokenView(): never {
  throw new Error('fallo de prueba');
}

describe('ModuleErrorBoundary', () => {
  it('muestra un fallback recuperable sin desmontar la aplicacion', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    render(
      <ModuleErrorBoundary resetKey="nodes">
        <BrokenView />
      </ModuleErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo abrir este modulo');
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });
});
