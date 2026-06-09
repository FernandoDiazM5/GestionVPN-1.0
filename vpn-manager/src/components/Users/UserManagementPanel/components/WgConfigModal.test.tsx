// ============================================================
//  WgConfigModal.test.tsx — modal Config WG en Gestión de Usuarios
//
//  Verifica las dos rutas de UX críticas:
//   1) Peer con conf guardada → muestra .conf real con botones
//   2) Peer sin conf (creado importando publicKey externa) → mensaje
//      amber explicativo, sin .conf
// ============================================================
import { describe, it, expect, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { renderWithProviders, screen, waitFor } from '../../../../test/render';
import { server } from '../../../../test/setup';
import { API_BASE_URL } from '../../../../config';
import WgConfigModal from './WgConfigModal';
import type { WgPeer } from '../../../../types/api';

const peer: WgPeer = {
  id: '*1',
  name: 'FIWIS - test@x.com - MEMBER',
  publicKey: 'PUBKEY1234567890abcdef==',
  allowedAddress: '192.168.21.50',
  lastHandshakeSecs: 5,
  active: true,
};

const sampleConf =
  '[Interface]\nPrivateKey = ABC123==\nAddress = 192.168.21.50/32\n' +
  'DNS = 8.8.8.8\n\n[Peer]\nPublicKey = SRVPUB==\nAllowedIPs = 0.0.0.0/0\n' +
  'Endpoint = 1.2.3.4:13231\nPersistentKeepalive = 25\n';

describe('<WgConfigModal />', () => {
  it('muestra el .conf cuando el endpoint devuelve uno', async () => {
    server.use(http.get(`${API_BASE_URL}/api/team/wireguard/by-key/:pk`, () =>
      HttpResponse.json({
        success: true,
        wireguard: {
          allowedIp: '192.168.21.50',
          publicKey: peer.publicKey,
          conf: sampleConf,
        },
      })));

    renderWithProviders(<WgConfigModal peer={peer} onClose={() => {}} />);

    // Aparece header con el nombre del peer
    expect(await screen.findByText(/Configuración WireGuard/i)).toBeInTheDocument();

    // El .conf real se muestra (esperamos hasta que el fetch resuelva)
    await waitFor(() => {
      expect(screen.getByText(/PrivateKey = ABC123==/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/Endpoint = 1.2.3.4:13231/i)).toBeInTheDocument();
    expect(screen.getByText(/AllowedIPs = 0.0.0.0\/0/i)).toBeInTheDocument();
  });

  it('muestra botones Copiar y Descargar cuando hay .conf', async () => {
    server.use(http.get(`${API_BASE_URL}/api/team/wireguard/by-key/:pk`, () =>
      HttpResponse.json({
        success: true,
        wireguard: { allowedIp: '192.168.21.50', publicKey: peer.publicKey, conf: sampleConf },
      })));

    renderWithProviders(<WgConfigModal peer={peer} onClose={() => {}} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /copiar/i })).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /descargar/i })).toBeInTheDocument();
  });

  it('muestra mensaje amber cuando el peer no tiene conf guardada', async () => {
    server.use(http.get(`${API_BASE_URL}/api/team/wireguard/by-key/:pk`, () =>
      HttpResponse.json({
        success: true,
        wireguard: { allowedIp: '192.168.21.50', publicKey: peer.publicKey, conf: null },
      })));

    renderWithProviders(<WgConfigModal peer={peer} onClose={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText(/no tiene una configuración guardada/i)).toBeInTheDocument();
    });
    // No debería haber botón Copiar habilitado para una conf nula
    expect(screen.queryByText(sampleConf)).not.toBeInTheDocument();
  });

  it('muestra error cuando el endpoint devuelve 404', async () => {
    server.use(http.get(`${API_BASE_URL}/api/team/wireguard/by-key/:pk`, () =>
      HttpResponse.json(
        { success: false, code: 'NO_WG', message: 'Peer no encontrado' },
        { status: 404 },
      )));

    renderWithProviders(<WgConfigModal peer={peer} onClose={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText(/Peer no encontrado/i)).toBeInTheDocument();
    });
  });

  it('invoca onClose al hacer clic en el botón Cerrar', async () => {
    server.use(http.get(`${API_BASE_URL}/api/team/wireguard/by-key/:pk`, () =>
      HttpResponse.json({
        success: true,
        wireguard: { allowedIp: '192.168.21.50', publicKey: peer.publicKey, conf: sampleConf },
      })));

    const onClose = vi.fn();
    const { user } = renderWithProviders(<WgConfigModal peer={peer} onClose={onClose} />);

    await waitFor(() => expect(screen.getByText(/PrivateKey/)).toBeInTheDocument());

    // Hay dos botones que matchean "Cerrar": el X del header (aria-label)
    // y el del footer (textContent). Tomamos el último (footer).
    const cerrarBtns = screen.getAllByRole('button', { name: /^cerrar$/i });
    await user.click(cerrarBtns[cerrarBtns.length - 1]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
