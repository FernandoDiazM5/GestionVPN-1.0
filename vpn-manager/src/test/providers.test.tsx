// ============================================================
//  providers.test.tsx — verifica que el wrapper renderWithProviders
//  monta los Context Providers reales (VpnProvider + WorkspaceSession)
//  y que los hooks asociados se pueden consumir sin crash.
// ============================================================
import { renderWithProviders, screen } from './render';
import { useVpn } from '../context';
import { useWorkspaceSession } from '../context/WorkspaceSession';
import { server } from './setup';
import { http, HttpResponse } from 'msw';
import { API_BASE_URL } from '../config';

function VpnConsumer() {
  const { activeModule } = useVpn();
  return <span data-testid="active-module">{String(activeModule ?? 'none')}</span>;
}

function SessionConsumer() {
  const { session } = useWorkspaceSession();
  return <span data-testid="session-email">{session?.email ?? 'none'}</span>;
}

describe('test/render wrapper', () => {
  it('VpnProvider está disponible y expone activeModule', () => {
    renderWithProviders(<VpnConsumer />);
    const el = screen.getByTestId('active-module');
    // No nos importa el valor exacto — solo que el provider monta y
    // useVpn() no tira por falta de contexto.
    expect(el).toBeInTheDocument();
    expect(typeof el.textContent).toBe('string');
  });
  it('comparte la sesion restaurada sin repetir /account/me', async () => {
    let requestCount = 0;
    server.use(
      http.get(`${API_BASE_URL}/api/account/me`, () => {
        requestCount += 1;
        return HttpResponse.json({
          success: true,
          user: {
            id: 'user-1',
            email: 'owner@example.com',
            role: 'OWNER',
            workspace_id: 'workspace-1',
            workspace_name: 'Workspace Uno',
          },
        });
      }),
      http.get(`${API_BASE_URL}/api/tunnel/status`, () => HttpResponse.json({
        success: true,
        active: false,
        node: null,
        expiresAt: null,
      })),
    );

    renderWithProviders(<SessionConsumer />);

    expect(await screen.findByText('owner@example.com')).toBeInTheDocument();
    expect(requestCount).toBe(1);
  });
});
