import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import NotFoundPage from './NotFoundPage';

describe('NotFoundPage', () => {
  it('expone una pagina 404 accesible con acciones de recuperacion', () => {
    render(<MemoryRouter><NotFoundPage /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: 'Pagina no encontrada' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Volver' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ir al inicio' })).toBeInTheDocument();
  });
});
