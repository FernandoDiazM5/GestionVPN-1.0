import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { VpsWireguardPreviewPanel } from './VpsWireguardPreviewPanel';

const mocks = vi.hoisted(() => ({ wireguardPreview: vi.fn(), wireguardCorePreview: vi.fn() }));
vi.mock('../../../../services/coreServerApi', () => ({ coreServerApi: mocks }));

const baseProps = { status: null, onRefreshStatus: vi.fn().mockResolvedValue(null), onConfigureCore: vi.fn() };

describe('VpsWireguardPreviewPanel', () => {
  it('valida el borrador sin ofrecer aplicación', async () => {
    mocks.wireguardPreview.mockResolvedValue({ success: true, preview: {
      valid: true, canApply: false, readOnly: true, blockers: [], warnings: [], conflicts: [],
      desired: {}, changes: [], actions: ['Crear wg0', 'Verificar handshake'],
    } });
    const user = userEvent.setup();
    render(<VpsWireguardPreviewPanel {...baseProps} />);
    await user.type(screen.getByLabelText('Clave pública del Core'), `${'A'.repeat(43)}=`);
    await user.click(screen.getByRole('button', { name: 'Validar sin aplicar' }));
    expect(await screen.findByText('Configuración válida')).toBeInTheDocument();
    expect(mocks.wireguardPreview).toHaveBeenCalledWith(expect.objectContaining({
      address: '10.12.250.60/32', coreEndpointHost: '213.173.36.232', coreEndpointPort: 13232,
      allowedIps: ['10.12.248.0/22'],
    }));
    expect(screen.getByRole('button', { name: 'Aplicar y esperar resultado' })).toBeDisabled();
  });

  it('reutiliza y muestra la clave pública confiable del agente', () => {
    const publicKey = `${'V'.repeat(43)}=`;
    render(<VpsWireguardPreviewPanel {...baseProps} status={{
      success: true,
      health: { configured: true, apiOk: true, status: 'HEALTHY' },
      vpsWireguard: { status: 'ACTIVE', readOnly: true, interface: 'wg0', toolsAvailable: true,
        interfacePresent: true, addresses: ['10.12.250.60/32'], listenPort: null, publicKey,
        routes: ['10.12.248.0/22'], inspectedAt: Date.now() },
      wireguardAgent: { requestId: 'req-1', operation: 'APPLY', status: 'COMPLETED', message: 'ok',
        publicKey, backupId: 'backup-1', completedAt: Date.now() },
      wireguardDesired: null,
      backup: { enabled: false, time: '02:00', timeZone: 'America/Lima', passwordConfigured: false, last: null },
    }} />);
    expect(screen.getByLabelText('Clave pública del VPS')).toHaveValue(publicKey);
    expect(screen.getByRole('button', { name: 'Copiar clave' })).toBeEnabled();
  });
});
