// ============================================================
//  providers.test.tsx — verifica que el wrapper renderWithProviders
//  monta los Context Providers reales (VpnProvider + WorkspaceSession)
//  y que los hooks asociados se pueden consumir sin crash.
// ============================================================
import { renderWithProviders, screen } from './render';
import { useVpn } from '../context';

function VpnConsumer() {
  const { activeModule } = useVpn();
  return <span data-testid="active-module">{String(activeModule ?? 'none')}</span>;
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
});
