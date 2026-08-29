import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { useModuleNavigation } from './useModuleNavigation';
import type { SessionUser } from '../../types/account';

const SESSION: SessionUser = {
  id: 'user-1',
  email: 'owner@example.com',
  role: 'OWNER',
  workspace_id: 'workspace-1',
  workspace_name: 'Housenet',
  workspace_slug: 'housenet',
};

function Probe({
  authenticated = true,
  session = SESSION,
  sessionLoading = false,
}: {
  authenticated?: boolean;
  session?: SessionUser | null;
  sessionLoading?: boolean;
}) {
  const { activeModule, setActiveModule, isNotFound } = useModuleNavigation(
    authenticated,
    session,
    sessionLoading,
  );
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
    render(<MemoryRouter initialEntries={['/dm/housenet/nodes']}><Probe /></MemoryRouter>);

    expect(screen.getByText('nodes')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Equipo' }));
    expect(screen.getByText('team')).toBeInTheDocument();
    expect(screen.getByLabelText('pathname')).toHaveTextContent('/dm/housenet/team');
  });

  it('migra la ruta legacy users hacia team', async () => {
    render(<MemoryRouter initialEntries={['/users']}><Probe /></MemoryRouter>);
    expect(await screen.findByText('team')).toBeInTheDocument();
    expect(screen.getByLabelText('pathname')).toHaveTextContent('/dm/housenet/team');
  });

  it('acepta el public path histórico y lo canoniza después del login', async () => {
    render(
      <MemoryRouter initialEntries={['/GestionVPN-1.0/monitor']}>
        <Probe />
      </MemoryRouter>,
    );
    expect(await screen.findByLabelText('pathname')).toHaveTextContent('/dm/housenet/monitor');
  });

  it('resuelve la ruta propia del historial de clientes', () => {
    render(<MemoryRouter initialEntries={['/dm/housenet/client-history']}><Probe /></MemoryRouter>);
    expect(screen.getByText('client-history')).toBeInTheDocument();
    expect(screen.getByLabelText('pathname')).toHaveTextContent('/dm/housenet/client-history');
  });

  it('muestra login en el public path histórico sin crear un bucle', () => {
    render(
      <MemoryRouter initialEntries={['/GestionVPN-1.0/']}>
        <Probe authenticated={false} session={null} />
      </MemoryRouter>,
    );
    expect(screen.getByLabelText('pathname')).toHaveTextContent('/GestionVPN-1.0/');
    expect(screen.getByLabelText('not-found')).toHaveTextContent('false');
  });

  it('conserva una ruta desconocida para que la aplicacion muestre 404', () => {
    render(<MemoryRouter initialEntries={['/ruta-inexistente']}><Probe /></MemoryRouter>);
    expect(screen.getByLabelText('not-found')).toHaveTextContent('true');
  });

  it('mantiene el login en raiz aunque localStorage recuerde team', () => {
    localStorage.setItem('vpn_active_module', 'team');
    render(<MemoryRouter initialEntries={['/']}><Probe authenticated={false} session={null} /></MemoryRouter>);
    expect(screen.getByText('team')).toBeInTheDocument();
    expect(screen.getByLabelText('pathname')).toHaveTextContent('/');
    expect(screen.getByLabelText('not-found')).toHaveTextContent('false');
  });

  it('conserva el deep-link del workspace mientras se inicia sesion', () => {
    render(
      <MemoryRouter initialEntries={['/dm/housenet/monitor']}>
        <Probe authenticated={false} session={null} />
      </MemoryRouter>,
    );
    expect(screen.getByLabelText('pathname')).toHaveTextContent('/dm/housenet/monitor');
    expect(screen.getByLabelText('not-found')).toHaveTextContent('false');
  });

  it('redirige la raiz al workspace autorizado despues del login', async () => {
    render(<MemoryRouter initialEntries={['/']}><Probe /></MemoryRouter>);
    expect(await screen.findByLabelText('pathname')).toHaveTextContent('/dm/housenet/nodes');
  });

  it('corrige un slug obsoleto al workspace autorizado y conserva el modulo', async () => {
    render(<MemoryRouter initialEntries={['/dm/otro/nodes']}><Probe /></MemoryRouter>);
    expect(screen.getByLabelText('not-found')).toHaveTextContent('false');
    expect(await screen.findByLabelText('pathname')).toHaveTextContent('/dm/housenet/nodes');
  });

  it('autocorrige una URL guardada cuando termina de restaurar la sesion', async () => {
    const { rerender } = render(
      <MemoryRouter initialEntries={['/dm/soportehousenet/nodes']}>
        <Probe authenticated={false} session={null} sessionLoading />
      </MemoryRouter>,
    );

    expect(screen.getByLabelText('not-found')).toHaveTextContent('false');
    expect(screen.getByLabelText('pathname')).toHaveTextContent('/dm/soportehousenet/nodes');

    rerender(
      <MemoryRouter>
        <Probe
          authenticated
          session={{ ...SESSION, workspace_slug: 'soporte-housenet' }}
          sessionLoading={false}
        />
      </MemoryRouter>,
    );

    expect(screen.getByLabelText('not-found')).toHaveTextContent('false');
    expect(await screen.findByLabelText('pathname')).toHaveTextContent('/dm/soporte-housenet/nodes');
  });

  it('no decide la ruta hasta recuperar la sesion', () => {
    render(
      <MemoryRouter initialEntries={['/dm/housenet/nodes']}>
        <Probe authenticated session={null} sessionLoading />
      </MemoryRouter>,
    );
    expect(screen.getByLabelText('not-found')).toHaveTextContent('false');
  });
});
