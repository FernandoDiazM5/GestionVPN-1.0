import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { useModuleNavigation } from './useModuleNavigation';

function Probe({ authenticated = true }: { authenticated?: boolean }) {
  const { activeModule, setActiveModule, isNotFound } = useModuleNavigation(authenticated);
  const location = useLocation();
  return (
    <div>
      <output>{activeModule}</output>
      <output aria-label="not-found">{String(isNotFound)}</output>
      <output aria-label="pathname">{location.pathname}</output>
      <button onClick={() => setActiveModule('team')}>Equipo</button>
    </div>
  );
}

describe('useModuleNavigation', () => {
  beforeEach(() => localStorage.clear());

  it('deriva el modulo desde la ruta y navega al seleccionar otro', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/nodes']}><Probe /></MemoryRouter>);

    expect(screen.getByText('nodes')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Equipo' }));
    expect(screen.getByText('team')).toBeInTheDocument();
  });

  it('migra la ruta legacy users hacia team', async () => {
    render(<MemoryRouter initialEntries={['/users']}><Probe /></MemoryRouter>);
    expect(await screen.findByText('team')).toBeInTheDocument();
  });

  it('conserva una ruta desconocida para que la aplicacion muestre 404', () => {
    render(<MemoryRouter initialEntries={['/ruta-inexistente']}><Probe /></MemoryRouter>);
    expect(screen.getByLabelText('not-found')).toHaveTextContent('true');
  });

  it('mantiene el login en raiz aunque localStorage recuerde team', () => {
    localStorage.setItem('vpn_active_module', 'team');
    render(<MemoryRouter initialEntries={['/']}><Probe authenticated={false} /></MemoryRouter>);
    expect(screen.getByText('team')).toBeInTheDocument();
    expect(screen.getByLabelText('pathname')).toHaveTextContent('/');
    expect(screen.getByLabelText('not-found')).toHaveTextContent('false');
  });

  it('saca una ruta privada hacia el login cuando no hay sesion', async () => {
    render(<MemoryRouter initialEntries={['/team']}><Probe authenticated={false} /></MemoryRouter>);
    expect(await screen.findByLabelText('pathname')).toHaveTextContent('/');
  });
});
