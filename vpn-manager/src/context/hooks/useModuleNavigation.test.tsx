import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { useModuleNavigation } from './useModuleNavigation';

function Probe() {
  const { activeModule, setActiveModule, isNotFound } = useModuleNavigation();
  return (
    <div>
      <output>{activeModule}</output>
      <output aria-label="not-found">{String(isNotFound)}</output>
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
});
