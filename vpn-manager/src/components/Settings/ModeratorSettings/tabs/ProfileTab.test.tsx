import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProfileTab from './ProfileTab';

const mocks = vi.hoisted(() => ({
  getStatus: vi.fn(),
  link: vi.fn(),
  unlink: vi.fn(),
}));

vi.mock('../../../../config/federatedAuth', () => ({ federatedAuthAvailable: true }));
vi.mock('../../../../services/federatedAuth', () => ({
  getGoogleLinkStatus: (...args: unknown[]) => mocks.getStatus(...args),
  linkGoogleAccount: (...args: unknown[]) => mocks.link(...args),
  unlinkGoogleAccount: (...args: unknown[]) => mocks.unlink(...args),
}));
vi.mock('../../../../context/WorkspaceSession', () => ({
  useWorkspaceSession: () => ({ session: { email: 'user@example.com' }, refresh: vi.fn() }),
}));

describe('ProfileTab Google', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getStatus.mockResolvedValue({
      linked: false, email: null, linkedAt: null, lastVerifiedAt: null,
    });
    mocks.link.mockResolvedValue({
      linked: true, email: 'user@example.com', message: 'Cuenta de Google vinculada correctamente',
    });
    mocks.unlink.mockResolvedValue({ linked: false, message: 'Cuenta de Google desvinculada' });
  });

  it('abre Google y enlaza directamente sin solicitar contraseña local', async () => {
    const user = userEvent.setup();
    render(<ProfileTab />);

    await user.click(screen.getByRole('tab', { name: 'Google' }));
    await screen.findByText('Enlaza el mismo correo de tu perfil para habilitar el acceso con Google.');
    const linkButton = screen.getByRole('button', { name: 'Enlazar cuenta de Google' });
    expect(screen.queryByLabelText('Contraseña actual para Google')).not.toBeInTheDocument();
    expect(linkButton).toBeEnabled();

    await user.click(linkButton);

    await waitFor(() => expect(mocks.link).toHaveBeenCalledWith());
    expect(await screen.findByText('Google enlazado')).toBeInTheDocument();
    expect(screen.getByText('user@example.com')).toBeInTheDocument();
  });

  it('desvincula un enlace existente de forma explícita', async () => {
    mocks.getStatus.mockResolvedValueOnce({
      linked: true,
      email: 'user@example.com',
      linkedAt: 1,
      lastVerifiedAt: 2,
    });
    const user = userEvent.setup();
    render(<ProfileTab />);

    await user.click(screen.getByRole('tab', { name: 'Google' }));
    expect(await screen.findByText('Google enlazado')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Contraseña actual para Google'), 'password-local');
    await user.click(screen.getByRole('button', { name: 'Desvincular Google' }));

    await waitFor(() => expect(mocks.unlink).toHaveBeenCalledWith('password-local'));
    expect(await screen.findByText('Cuenta de Google desvinculada')).toBeInTheDocument();
  });
});
