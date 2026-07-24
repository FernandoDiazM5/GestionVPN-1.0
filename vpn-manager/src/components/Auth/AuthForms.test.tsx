import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RouterAccess from './RouterAccess';
import AcceptInvitationForm from './AcceptInvitationForm';
import PasswordResetRequest from './PasswordResetRequest';
import PasswordResetConfirm from './PasswordResetConfirm';

const mocks = vi.hoisted(() => ({
  fetchWithTimeout: vi.fn(),
  handleLoginSuccess: vi.fn(),
  acceptInvitation: vi.fn(),
  provisionMyWireguard: vi.fn(),
  requestReset: vi.fn(),
  confirmReset: vi.fn(),
  signInWithGoogle: vi.fn(),
}));

vi.mock('../../context', () => ({
  useVpn: () => ({ handleLoginSuccess: mocks.handleLoginSuccess }),
}));

vi.mock('../../utils/fetchWithTimeout', () => ({
  fetchWithTimeout: (...args: unknown[]) => mocks.fetchWithTimeout(...args),
}));

vi.mock('../../config/federatedAuth', () => ({ federatedAuthAvailable: true }));

vi.mock('../../services/federatedAuth', () => ({
  signInWithGoogle: (...args: unknown[]) => mocks.signInWithGoogle(...args),
}));

vi.mock('../../services/teamApi', () => ({
  teamApi: {
    accept: (...args: unknown[]) => mocks.acceptInvitation(...args),
    provisionMyWireguard: (...args: unknown[]) => mocks.provisionMyWireguard(...args),
  },
}));

vi.mock('../../services/passwordResetApi', () => ({
  passwordResetApi: {
    request: (...args: unknown[]) => mocks.requestReset(...args),
    confirm: (...args: unknown[]) => mocks.confirmReset(...args),
  },
}));

const jsonResponse = (body: object, ok = true) => ({
  ok,
  json: vi.fn().mockResolvedValue(body),
}) as unknown as Response;

const acceptedInvitation = {
  user: { email: 'persona@example.com', role: 'MEMBER' },
  tunnel: null,
  wireguard: {
    allowedIp: '10.0.0.2/32',
    serverPublicKey: 'server-key',
    endpoint: 'vpn.example.com:51820',
    allowedIps: '0.0.0.0/0',
  },
  conf: null,
  wgError: null,
};

describe('formularios de acceso', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, '', '/');
  });

  it('asocia labels y autocomplete en el login y anuncia errores', async () => {
    mocks.fetchWithTimeout
      .mockResolvedValueOnce(jsonResponse({ success: true, needsSetup: false }))
      .mockResolvedValueOnce(jsonResponse({ success: false, message: 'Credenciales inválidas' }, false));

    const user = userEvent.setup();
    render(<RouterAccess />);

    const username = await screen.findByLabelText('Usuario o correo');
    const password = screen.getByLabelText('Contraseña');
    expect(username).toHaveAttribute('id', 'login-username');
    expect(username).toHaveAttribute('name', 'username');
    expect(username).toHaveAttribute('autocomplete', 'username');
    expect(password).toHaveAttribute('name', 'password');
    expect(password).toHaveAttribute('autocomplete', 'current-password');
    expect(password).toHaveAttribute('minlength', '12');

    await user.type(username, 'moderador@example.com');
    await user.type(password, 'password-seguro');
    await user.click(screen.getByRole('button', { name: 'Iniciar Sesión' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Credenciales inválidas');
  });

  it('intercambia el acceso Firebase sin reemplazar el login local', async () => {
    mocks.fetchWithTimeout.mockResolvedValueOnce(jsonResponse({ success: true, needsSetup: false }));
    mocks.signInWithGoogle.mockResolvedValueOnce({
      id: 'user-1', email: 'moderador@example.com', role: 'OWNER', workspace_id: 'ws-1',
    });
    const user = userEvent.setup();
    render(<RouterAccess />);

    await screen.findByLabelText('Usuario o correo');
    expect(screen.getByRole('button', { name: 'Iniciar Sesión' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Continuar con Google' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Continuar con Google' }));

    await waitFor(() => {
      expect(mocks.signInWithGoogle).toHaveBeenCalledWith();
      expect(mocks.handleLoginSuccess).toHaveBeenCalledWith({
        user: 'moderador@example.com', role: 'admin',
      });
    });
  });

  it('permite aceptar una invitación existente sin contraseña', async () => {
    mocks.acceptInvitation.mockResolvedValueOnce(acceptedInvitation);
    const user = userEvent.setup();
    render(<AcceptInvitationForm onBack={vi.fn()} onLoggedIn={vi.fn()} />);

    const email = screen.getByLabelText('Correo invitado');
    const otp = screen.getByLabelText('Código de invitación');
    const password = screen.getByLabelText(/Contraseña/);
    expect(email).toHaveAttribute('autocomplete', 'email');
    expect(otp).toHaveAttribute('autocomplete', 'one-time-code');
    expect(password).not.toBeRequired();

    await user.type(email, 'persona@example.com');
    await user.type(otp, '123456');
    await user.click(screen.getByRole('button', { name: 'Aceptar y unirme' }));

    await waitFor(() => {
      expect(mocks.acceptInvitation).toHaveBeenCalledWith('persona@example.com', '123456', undefined);
    });
  });

  it('solicita una contraseña válida cuando el backend identifica una cuenta nueva', async () => {
    const requiredError = Object.assign(new Error('Define una contraseña para crear tu cuenta'), {
      code: 'PASSWORD_REQUIRED',
    });
    mocks.acceptInvitation
      .mockRejectedValueOnce(requiredError)
      .mockResolvedValueOnce(acceptedInvitation);

    const user = userEvent.setup();
    render(<AcceptInvitationForm onBack={vi.fn()} onLoggedIn={vi.fn()} />);
    await user.type(screen.getByLabelText('Correo invitado'), 'persona@example.com');
    await user.type(screen.getByLabelText('Código de invitación'), '123456');
    await user.click(screen.getByRole('button', { name: 'Aceptar y unirme' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Define una contraseña');
    const password = screen.getByLabelText(/Contraseña/);
    expect(password).toBeRequired();

    await user.type(password, '12345678901');
    expect(screen.getByRole('button', { name: 'Aceptar y unirme' })).toBeDisabled();
    await user.type(password, '2');
    await user.click(screen.getByRole('button', { name: 'Aceptar y unirme' }));

    await waitFor(() => expect(mocks.acceptInvitation).toHaveBeenCalledTimes(2));
    expect(mocks.acceptInvitation).toHaveBeenLastCalledWith('persona@example.com', '123456', '123456789012');
  });

  it('usa un email validado y anuncia el resultado de recuperación', async () => {
    mocks.requestReset.mockResolvedValueOnce({ success: true });
    const user = userEvent.setup();
    render(<PasswordResetRequest onBack={vi.fn()} />);

    const email = screen.getByLabelText('Correo electrónico');
    expect(email).toHaveAttribute('name', 'email');
    expect(email).toHaveAttribute('autocomplete', 'email');
    await user.type(email, 'persona@example.com');
    await user.click(screen.getByRole('button', { name: 'Enviar enlace' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Solicitud enviada');
    expect(mocks.requestReset).toHaveBeenCalledWith('persona@example.com');
  });

  it('no habilita el reset hasta confirmar una contraseña de ocho caracteres', async () => {
    mocks.confirmReset.mockResolvedValueOnce({ success: true });
    const user = userEvent.setup();
    render(<PasswordResetConfirm token="reset-token" onBack={vi.fn()} onSuccess={vi.fn()} />);

    const password = screen.getByLabelText('Nueva contraseña');
    const confirm = screen.getByLabelText('Confirmar contraseña');
    const submit = screen.getByRole('button', { name: 'Actualizar contraseña' });
    expect(password).toHaveAttribute('autocomplete', 'new-password');
    expect(confirm).toHaveAttribute('autocomplete', 'new-password');

    await user.type(password, '12345678');
    expect(submit).toBeDisabled();
    await user.type(confirm, '12345670');
    expect(screen.getByText('Las contraseñas no coinciden')).toBeInTheDocument();
    expect(submit).toBeDisabled();
    await user.clear(confirm);
    await user.type(confirm, '12345678');
    await user.click(submit);

    expect(mocks.confirmReset).toHaveBeenCalledWith('reset-token', '12345678');
    expect(await screen.findByRole('status')).toHaveTextContent('Contraseña actualizada');
  });
});
