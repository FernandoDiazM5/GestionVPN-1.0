import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CoreServerPanel } from './CoreServerPanel';

const mocks = vi.hoisted(() => ({ status: vi.fn(), health: vi.fn(), preview: vi.fn(), provision: vi.fn(), backupNow: vi.fn() }));

vi.mock('../../../../services/coreServerApi', () => ({
  coreServerApi: mocks,
}));

const status = {
  success: true as const,
  health: {
    configured: true, apiOk: true, status: 'HEALTHY' as const, identity: 'GW-VPN-CORE-ISP',
    version: '7.20', model: 'CHR', vpnReady: true,
  },
  backup: { enabled: true, time: '02:00', timeZone: 'America/Lima', passwordConfigured: true, last: null },
};

const baseProps = {
  settings: {
    core_backup_enabled: true, core_backup_time: '02:00', core_backup_timezone: 'America/Lima',
    core_backup_password: '********', core_wan_interface: 'ether1', core_vps_public_key: '',
  },
  onSettingsChange: vi.fn(), onSave: vi.fn().mockResolvedValue(undefined), onChangeRouter: vi.fn(),
  isSaving: false, successMsg: '', errorMsg: '',
};

describe('CoreServerPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.status.mockResolvedValue(status);
  });

  it('muestra el estado del servidor existente y la política de respaldo', async () => {
    render(<CoreServerPanel {...baseProps} />);
    expect(await screen.findByText('GW-VPN-CORE-ISP')).toBeInTheDocument();
    expect(screen.getByText('Operativo')).toBeInTheDocument();
    expect(screen.getByText(/Envía juntos un .backup AES-SHA256 y un .rsc legible/)).toBeInTheDocument();
  });

  it('presenta bloqueadores antes de preparar el equipo', async () => {
    mocks.preview.mockResolvedValue({
      success: true,
      confirmation: 'PREPARAR DESDE CERO',
      preview: { canProvision: false, blockers: ['Se detectaron objetos operativos.'], actions: ['Crear WireGuard'] },
    });
    const user = userEvent.setup();
    render(<CoreServerPanel {...baseProps} />);
    await screen.findByText('GW-VPN-CORE-ISP');
    await user.click(screen.getByRole('button', { name: 'Revisar antes de preparar' }));
    expect(await screen.findByText('Preparación bloqueada')).toBeInTheDocument();
    expect(screen.getByText('Se detectaron objetos operativos.')).toBeInTheDocument();
  });

  it('solicita el respaldo manual y actualiza el estado', async () => {
    mocks.backupNow.mockResolvedValue({ success: true, result: { sent: true, filenames: ['uno.backup', 'uno.rsc'] } });
    const user = userEvent.setup();
    render(<CoreServerPanel {...baseProps} />);
    await screen.findByText('GW-VPN-CORE-ISP');
    await user.click(screen.getByRole('button', { name: 'Generar y enviar ahora' }));
    await waitFor(() => expect(mocks.backupNow).toHaveBeenCalledOnce());
    expect(await screen.findByText(/uno.backup y uno.rsc/)).toBeInTheDocument();
  });
});
