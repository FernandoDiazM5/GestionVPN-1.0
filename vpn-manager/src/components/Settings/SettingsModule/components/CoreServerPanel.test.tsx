import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CoreServerPanel } from './CoreServerPanel';

const mocks = vi.hoisted(() => ({ status: vi.fn(), health: vi.fn(), preview: vi.fn(), provision: vi.fn(), backupNow: vi.fn(), managementSupernetPreview: vi.fn() }));

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
    mocks.managementSupernetPreview.mockResolvedValue({
      success: true,
      preview: { valid: true, canSave: true, locked: false, blockers: [], overlaps: [], plan: {
        net: '10.12.248.0/22', scanNet: '10.12.248.0/24', scanBase: '10.12.248.',
        clientsNet: '10.12.249.0/24', clientsBase: '10.12.249.', vpsNet: '10.12.250.0/24',
        vpsBase: '10.12.250.', adminNet: '10.12.251.0/24', adminBase: '10.12.251.',
      } },
    });
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

  it('muestra la división autoritativa devuelta por el backend', async () => {
    render(<CoreServerPanel {...baseProps} settings={{ ...baseProps.settings, management_supernet: '10.12.248.0/22' }} />);
    expect(await screen.findByText('10.12.248.0/24')).toBeInTheDocument();
    expect(screen.getByText('10.12.251.0/24')).toBeInTheDocument();
    expect(mocks.managementSupernetPreview).toHaveBeenCalledWith('10.12.248.0/22');
  });
});
