import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./hooks', () => ({
  useLoadSettings: () => ({
    settings: { MT_IP: '', MT_USER: '', MT_PASS: '', scan_mode: 'vps', error_report_email: '' },
    setSettings: vi.fn(),
    isLoading: false,
    errorMsg: '',
    loadSettings: vi.fn(),
  }),
  useSaveSettings: () => ({
    handleSave: vi.fn(),
    isSaving: false,
    successMsg: '',
    errorMsg: '',
  }),
}));

vi.mock('./components', () => ({
  SettingsHeader: () => <div>Contenido Router Core</div>,
  SettingsForm: () => <div>Formulario Core</div>,
  SettingsMessages: () => null,
  ErrorReportingSettings: () => <div>Contenido Reportes</div>,
  CoreServerPanel: () => <div>Contenido Servidor VPN</div>,
}));

vi.mock('../ModeratorSettings/tabs/ProfileTab', () => ({
  default: () => <div>Contenido Cuenta</div>,
}));
vi.mock('../ModeratorSettings/tabs/IntegrationsTab', () => ({
  default: () => <div>Contenido Integraciones</div>,
}));

import SettingsModule from './SettingsModule';

describe('SettingsModule menu', () => {
  it('muestra una sola seccion y permite navegar entre las cinco opciones', async () => {
    const user = userEvent.setup();
    render(<SettingsModule />);

    expect(screen.getByText('Contenido Router Core')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Escaneo/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Servidor VPN Estado, respaldo y provision' }));
    expect(screen.getByText('Contenido Servidor VPN')).toBeInTheDocument();
    expect(screen.queryByText('Contenido Router Core')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Reportes tecnicos Destinatario y correo de prueba' }));
    expect(screen.getByText('Contenido Reportes')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cuenta Correo y contrasena' }));
    expect(screen.getByText('Contenido Cuenta')).toBeInTheDocument();
    expect(screen.queryByText('Contenido Reportes')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Integraciones Correo, Telegram y Google Login' }));
    expect(screen.getByText('Contenido Integraciones')).toBeInTheDocument();
    expect(screen.queryByText('Contenido Cuenta')).not.toBeInTheDocument();
  });
});
