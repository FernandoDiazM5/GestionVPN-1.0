import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NodeInfo } from '../../../../types/api';

const fetchMock = vi.hoisted(() => vi.fn());
vi.mock('../../../../utils/fetchWithTimeout', () => ({ fetchWithTimeout: fetchMock }));

import { useNodeSshCredentials } from './useNodeSshCredentials';

const node: NodeInfo = {
  id: '1', nombre_nodo: 'Housenet', nombre_vrf: 'VRF-ND2-HOUSENET',
  ppp_user: 'ppp-housenet-nd2', segmento_lan: '10.1.1.0/24',
  service: 'sstp', disabled: false, running: true, ip_tunnel: '10.11.251.2', uptime: '',
};

const response = (body: object, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' },
});

describe('useNodeSshCredentials', () => {
  beforeEach(() => vi.clearAllMocks());

  it('hidrata las credenciales al seleccionar el nodo, sin esperar un escaneo', async () => {
    fetchMock.mockResolvedValueOnce(response({ success: true, creds: [
      { user: 'ubnt', pass: 'secret', port: 22 },
      { user: '', pass: 'invalid', port: 22 },
    ] }));
    const { result } = renderHook(() => useNodeSshCredentials(node));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.creds).toEqual([{ user: 'ubnt', pass: 'secret', port: 22 }]);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/node/ssh-creds/get'), expect.objectContaining({
      body: JSON.stringify({ pppUser: node.ppp_user }),
    }), 5_000);
  });

  it('diferencia ausencia real de credenciales de un fallo de consulta', async () => {
    fetchMock.mockResolvedValueOnce(response({ success: true, creds: [] }));
    const { result } = renderHook(() => useNodeSshCredentials(node));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.creds).toEqual([]);
    expect(result.current.error).toBe('');
  });

  it('expone permiso insuficiente sin convertirlo en "sin credenciales"', async () => {
    fetchMock.mockResolvedValueOnce(response({ success: false, message: 'Acceso denegado' }, 403));
    const { result } = renderHook(() => useNodeSshCredentials(node));
    await waitFor(() => expect(result.current.status).toBe('forbidden'));
    expect(result.current.error).toBe('Acceso denegado');
  });

  it('expone errores de red y permite reintentar', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Sin conexión'))
      .mockResolvedValueOnce(response({ success: true, creds: [{ user: 'housenet', pass: 'secret' }] }));
    const { result } = renderHook(() => useNodeSshCredentials(node));
    await waitFor(() => expect(result.current.status).toBe('error'));
    result.current.reload();
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.creds[0]?.user).toBe('housenet');
  });
});
