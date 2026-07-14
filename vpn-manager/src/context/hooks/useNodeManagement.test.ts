import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NodeInfo } from '../../types/api';
import { useNodeManagement } from './useNodeManagement';
import { useTunnelTimeout } from './useTunnelTimeout';

const activeNode: NodeInfo = {
  id: 'node-1',
  nombre_nodo: 'Nodo activo',
  ppp_user: 'ppp-active',
  segmento_lan: '10.0.1.0/24',
  nombre_vrf: 'vrf-active',
  service: 'sstp',
  disabled: false,
  running: true,
  ip_tunnel: '172.16.0.1',
  uptime: '1h',
};

const inactiveNode: NodeInfo = {
  ...activeNode,
  id: 'node-2',
  nombre_nodo: 'Nodo inactivo',
  ppp_user: 'ppp-inactive',
  nombre_vrf: 'vrf-inactive',
  running: false,
};

describe('useNodeManagement', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('elimina un nodo inactivo sin modificar el tunel activo', () => {
    const { result } = renderHook(() => useNodeManagement());

    act(() => {
      result.current.setNodes([activeNode, inactiveNode]);
      result.current.setActiveNodeVrf(activeNode.nombre_vrf);
      result.current.setTunnelExpiry(123_456);
    });
    act(() => result.current.removeNodeFromState(inactiveNode.ppp_user));

    expect(result.current.nodes).toEqual([activeNode]);
    expect(result.current.activeNodeVrf).toBe(activeNode.nombre_vrf);
    expect(result.current.tunnelExpiry).toBe(123_456);
  });

  it('elimina un nodo activo y limpia su estado de tunel en la misma transicion', () => {
    const { result } = renderHook(() => useNodeManagement());

    act(() => {
      result.current.setNodes([activeNode, inactiveNode]);
      result.current.setActiveNodeVrf(activeNode.nombre_vrf);
      result.current.setTunnelExpiry(123_456);
    });
    act(() => result.current.removeNodeFromState(activeNode.ppp_user));

    expect(result.current.nodes).toEqual([inactiveNode]);
    expect(result.current.activeNodeVrf).toBeNull();
    expect(result.current.tunnelExpiry).toBeNull();
  });

  it('acepta actualizaciones funcionales sin crear una segunda fuente de verdad', () => {
    const { result } = renderHook(() => useNodeManagement());

    act(() => result.current.setNodes((nodes) => [...nodes, activeNode]));
    act(() => result.current.setActiveNodeVrf(() => activeNode.nombre_vrf));

    expect(result.current.nodes).toEqual([activeNode]);
    expect(result.current.activeNodeVrf).toBe(activeNode.nombre_vrf);
  });

  it('permite que el hook propietario cancele su timer al eliminar el nodo activo', () => {
    vi.useFakeTimers();
    const deactivateAllNodes = vi.fn(async () => undefined);
    const { result } = renderHook(() => {
      const management = useNodeManagement();
      useTunnelTimeout(management.tunnelExpiry, deactivateAllNodes);
      return management;
    });

    act(() => {
      result.current.setNodes([activeNode]);
      result.current.setActiveNodeVrf(activeNode.nombre_vrf);
      result.current.setTunnelExpiry(Date.now() + 60_000);
    });
    expect(vi.getTimerCount()).toBe(1);

    act(() => result.current.removeNodeFromState(activeNode.ppp_user));

    expect(result.current.tunnelExpiry).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
});
