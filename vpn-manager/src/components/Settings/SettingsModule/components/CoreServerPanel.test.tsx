import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CoreServerPanel } from './CoreServerPanel';

const mocks = vi.hoisted(() => ({ status: vi.fn(), health: vi.fn(), preview: vi.fn(), provision: vi.fn(), backupNow: vi.fn(), history: vi.fn(), managementSupernetPreview: vi.fn() }));

vi.mock('../../../../services/coreServerApi', () => ({
  coreServerApi: mocks,
}));

const status = {
  success: true as const,
  health: {
    configured: true, apiOk: true, status: 'HEALTHY' as const, identity: 'GW-VPN-CORE-ISP',
    version: '7.20', model: 'CHR', vpnReady: true,
  },
  vpsWireguard: {
    status: 'NOT_CONFIGURED' as const, readOnly: true as const, interface: 'wg0', toolsAvailable: false,
    interfacePresent: false, addresses: [], listenPort: null, publicKey: null, routes: [], inspectedAt: Date.now(),
  },
  wireguardAgent: null,
  wireguardDesired: null,
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
    mocks.history.mockResolvedValue({ success: true, runs: [] });
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
    expect(screen.getByText(/Mantenimiento independiente del asistente/)).toBeInTheDocument();
    expect(screen.getByText('WireGuard del VPS')).toBeInTheDocument();
    expect(screen.getByText('WireGuard todavía no está configurado en este VPS.')).toBeInTheDocument();
  });

  it('muestra un único asistente por etapas con progreso en forma de flecha', async () => {
    render(<CoreServerPanel {...baseProps} />);
    await screen.findByText('GW-VPN-CORE-ISP');
    expect(screen.getByRole('heading', { name: 'Instalar servidor VPN' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Progreso de instalación del servidor VPN' })).toBeInTheDocument();
    expect(screen.queryByText('Asistente de configuración')).not.toBeInTheDocument();
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
