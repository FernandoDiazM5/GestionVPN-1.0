import { act, renderHook, waitFor } from '@testing-library/react';
import type { NodeInfo } from '../../../../types/api';
import { useNodeActivation } from './useNodeActivation';

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  fetchWithTimeout: vi.fn(),
  deactivateAllNodes: vi.fn(),
  setActiveNodeVrf: vi.fn(),
  setTunnelExpiry: vi.fn(),
  vpn: {
    credentials: { user: 'moderador@example.test', role: 'admin' },
    activeNodeVrf: 'VRF-ND1' as string | null,
  },
}));

vi.mock('../../../../utils/apiClient', () => ({
  apiFetch: mocks.apiFetch,
}));

vi.mock('../../../../utils/fetchWithTimeout', () => ({
  fetchWithTimeout: mocks.fetchWithTimeout,
}));

vi.mock('../../../../context', () => ({
  TUNNEL_TIMEOUT_MS: 30 * 60 * 1000,
  useVpn: () => ({
    ...mocks.vpn,
    setActiveNodeVrf: mocks.setActiveNodeVrf,
    setTunnelExpiry: mocks.setTunnelExpiry,
    deactivateAllNodes: mocks.deactivateAllNodes,
  }),
}));

const node: NodeInfo = {
  id: 'node-1',
  nombre_nodo: 'Nodo 1',
  ppp_user: 'ppp-node-1',
  segmento_lan: '192.168.30.0/24',
  nombre_vrf: 'VRF-ND1',
  service: 'wireguard',
  disabled: false,
  running: true,
  ip_tunnel: '10.0.2.31',
  uptime: '1h',
};

describe('useNodeActivation', () => {
  beforeEach(() => {
    mocks.vpn.activeNodeVrf = node.nombre_vrf;
    mocks.apiFetch.mockReset();
    mocks.apiFetch.mockResolvedValue(new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ));
    mocks.fetchWithTimeout.mockReset();
    mocks.deactivateAllNodes.mockReset();
    mocks.setActiveNodeVrf.mockReset();
    mocks.setTunnelExpiry.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('cierra los mensajes al confirmar una revocacion local', async () => {
    mocks.deactivateAllNodes.mockResolvedValue(undefined);
    const { result } = renderHook(() => useNodeActivation(node));

    act(() => result.current.setLogs([
      'Configurando acceso: VRF-ND1',
      '✓ Acceso abierto: VRF-ND1',
    ]));
    await act(async () => {
      await result.current.handleDeactivate();
    });

    expect(result.current.logs).toEqual([]);
    expect(result.current.isDeactivating).toBe(false);
  });

  it('reemplaza los mensajes de activacion mientras la revocacion esta pendiente', async () => {
    let finishDeactivation: (() => void) | undefined;
    mocks.deactivateAllNodes.mockReturnValue(new Promise<void>((resolve) => {
      finishDeactivation = resolve;
    }));
    const { result } = renderHook(() => useNodeActivation(node));

    act(() => result.current.setLogs(['✓ Acceso abierto: VRF-ND1']));
    let deactivation: Promise<void>;
    act(() => {
      deactivation = result.current.handleDeactivate();
    });

    expect(result.current.logs).toEqual(['Revocando acceso...']);

    await act(async () => {
      finishDeactivation?.();
      await deactivation;
    });
  });

  it('mantiene el error visible y el nodo activo cuando la revocacion falla', async () => {
    mocks.deactivateAllNodes.mockRejectedValue(new Error('El router no respondió'));
    const { result } = renderHook(() => useNodeActivation(node));

    await act(async () => {
      await result.current.handleDeactivate();
    });

    expect(result.current.logs).toEqual([
      'Revocando acceso...',
      '✗ Error: El router no respondió',
    ]);
    expect(result.current.isThisNodeActive).toBe(true);
  });

  it('elimina mensajes obsoletos ante expiracion o revocacion externa', async () => {
    const { result, rerender } = renderHook(() => useNodeActivation(node));
    act(() => result.current.setLogs(['✓ Acceso abierto: VRF-ND1']));

    mocks.vpn.activeNodeVrf = null;
    rerender();

    await waitFor(() => expect(result.current.logs).toEqual([]));
    expect(result.current.isThisNodeActive).toBe(false);
  });

  it('cancela un cierre programado cuando comienza una operacion nueva', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useNodeActivation(node));

    act(() => {
      result.current.setLogs(['✓ Reparación completa']);
      result.current.scheduleLogsClear(3000);
      result.current.setLogs(['Configurando acceso: VRF-ND1']);
      vi.advanceTimersByTime(3000);
    });

    expect(result.current.logs).toEqual(['Configurando acceso: VRF-ND1']);
  });
});
