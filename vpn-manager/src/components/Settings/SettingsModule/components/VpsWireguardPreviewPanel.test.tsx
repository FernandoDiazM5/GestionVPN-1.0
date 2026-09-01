import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { VpsWireguardPreviewPanel } from './VpsWireguardPreviewPanel';

const mocks = vi.hoisted(() => ({ wireguardCorePreview: vi.fn() }));
vi.mock('../../../../services/coreServerApi', () => ({ coreServerApi: mocks }));

const settings = { MT_IP: '', MT_USER: '', MT_PASS: '', server_public_ip: '', core_internal_ip: '', core_local_networks: '' };
const baseProps = { status: null, settings, onSettingsChange: vi.fn(), onSaveSettings: vi.fn().mockResolvedValue(undefined), onRefreshStatus: vi.fn().mockResolvedValue(null) };

describe('VpsWireguardPreviewPanel', () => {
  it('empieza solicitando endpoint público, IP privada, credenciales y redes locales', () => {
    render(<VpsWireguardPreviewPanel {...baseProps} />);
    expect(screen.getByRole('heading', { name: '1. Datos del MikroTik' })).toBeInTheDocument();
    expect(screen.getByLabelText('IP pública o dominio')).toBeInTheDocument();
    expect(screen.getByLabelText('IP privada del MikroTik')).toBeInTheDocument();
    expect(screen.getByLabelText(/Redes locales autorizadas/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Guardar y enlazar/ })).toBeDisabled();
  });

  it('muestra una flecha de progreso y no mezcla las seis vistas', async () => {
    const user = userEvent.setup();
    render(<VpsWireguardPreviewPanel {...baseProps} />);
    expect(screen.getByRole('list', { name: 'Progreso de instalación del servidor VPN' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '2. Preparar el MikroTik' })).not.toBeInTheDocument();
    const futureStep = screen.getByRole('button', { name: /Preparar MikroTik/ });
    expect(futureStep).toBeDisabled();
    await user.click(futureStep);
    expect(screen.getByRole('heading', { name: '1. Datos del MikroTik' })).toBeInTheDocument();
  });

  it('reanuda en intercambio de claves cuando la VPS ya publicó su clave', () => {
    const publicKey = `${'V'.repeat(43)}=`;
    render(<VpsWireguardPreviewPanel {...baseProps} settings={{ ...settings, server_public_ip: '38.25.114.72' }} status={{
      success: true,
      health: { configured: true, apiOk: true, status: 'HEALTHY' },
      vpsWireguard: { status: 'ACTIVE', readOnly: true, interface: 'wg0', toolsAvailable: true,
        interfacePresent: true, addresses: ['10.12.250.60/32'], listenPort: null, publicKey,
        routes: ['10.12.248.0/22'], inspectedAt: Date.now() },
      wireguardAgent: { requestId: 'req-1', operation: 'APPLY', status: 'COMPLETED', message: 'ok', publicKey, backupId: 'backup-1', completedAt: Date.now() },
      wireguardDesired: null, coreFirewallLockedAt: null,
      backup: { enabled: false, time: '02:00', timeZone: 'America/Lima', passwordConfigured: false, last: null },
    }} />);
    expect(screen.getByRole('heading', { name: '4. Intercambiar claves' })).toBeInTheDocument();
    expect(screen.getByLabelText('Clave pública del VPS')).toHaveValue(publicKey);
  });
});
