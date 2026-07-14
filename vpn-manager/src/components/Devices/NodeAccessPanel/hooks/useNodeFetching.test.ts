import {
  NODE_CACHE_KEY,
  NODE_CACHE_TTL_MS,
  persistNodesCache,
  readNodesCache,
} from './useNodeFetching';
import type { NodeInfo } from '../../../../types/api';

const node: NodeInfo = {
  id: 'node-1',
  nombre_nodo: 'Nodo Uno',
  ppp_user: 'node-user',
  segmento_lan: '192.168.10.0/24',
  nombre_vrf: 'VRF-NODO-1',
  service: 'wireguard',
  disabled: false,
  running: true,
  ip_tunnel: '10.0.0.2',
  uptime: '1h',
};

describe('node session cache', () => {
  beforeEach(() => sessionStorage.clear());

  it('restaura datos dentro del TTL', () => {
    const now = 20_000_000;
    expect(persistNodesCache(sessionStorage, [node], now - NODE_CACHE_TTL_MS)).toBe(true);
    expect(readNodesCache(sessionStorage, now)).toEqual([node]);
  });

  it('elimina datos vencidos, corruptos o con reloj futuro', () => {
    const now = 20_000_000;
    persistNodesCache(sessionStorage, [node], now - NODE_CACHE_TTL_MS - 1);
    expect(readNodesCache(sessionStorage, now)).toBeNull();
    expect(sessionStorage.getItem(NODE_CACHE_KEY)).toBeNull();

    sessionStorage.setItem(NODE_CACHE_KEY, JSON.stringify({ at: now + 1, nodes: [node] }));
    expect(readNodesCache(sessionStorage, now)).toBeNull();

    sessionStorage.setItem(NODE_CACHE_KEY, '{invalido');
    expect(readNodesCache(sessionStorage, now)).toBeNull();
    expect(sessionStorage.getItem(NODE_CACHE_KEY)).toBeNull();
  });
});
