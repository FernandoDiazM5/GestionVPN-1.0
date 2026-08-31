import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { VpsWireguardPreviewPanel } from './VpsWireguardPreviewPanel';

const mocks = vi.hoisted(() => ({ wireguardPreview: vi.fn() }));
vi.mock('../../../../services/coreServerApi', () => ({ coreServerApi: mocks }));

describe('VpsWireguardPreviewPanel', () => {
  it('valida el borrador sin ofrecer aplicación', async () => {
    mocks.wireguardPreview.mockResolvedValue({ success: true, preview: {
      valid: true, canApply: false, readOnly: true, blockers: [], warnings: [], conflicts: [],
      desired: {}, changes: [], actions: ['Crear wg0', 'Verificar handshake'],
    } });
    const user = userEvent.setup();
    render(<VpsWireguardPreviewPanel />);
    await user.type(screen.getByLabelText('Clave pública del Core'), `${'A'.repeat(43)}=`);
    await user.click(screen.getByRole('button', { name: 'Validar sin aplicar' }));
    expect(await screen.findByText('Configuración válida')).toBeInTheDocument();
    expect(mocks.wireguardPreview).toHaveBeenCalledWith(expect.objectContaining({
      address: '10.12.250.60/32', coreEndpointHost: '213.173.36.232', coreEndpointPort: 13232,
      allowedIps: ['10.12.248.0/22'],
    }));
    expect(screen.getByRole('button', { name: 'Aplicar mediante agente' })).toBeDisabled();
  });
});
