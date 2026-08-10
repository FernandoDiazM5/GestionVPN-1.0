const { stubModule } = require('../helpers/moduleMock');

const query = vi.fn();
stubModule(__dirname, '../../db/mysql', { getPool: () => ({ query }) });
stubModule(__dirname, '../../lib/logger', {
  child: () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() }),
});

const { buildNodeUpdate } = require('../../db.service');

beforeEach(() => vi.clearAllMocks());

describe('updateNodeFields', () => {
  it('actualiza únicamente las redes enviadas y conserva VRF/nombre/interfaz', () => {
    const { assignments, params } = buildNodeUpdate({
      ppp_user: 'WG-ND13-X',
      lan_subnets: ['192.168.100.0/24', '192.168.30.0/24'],
      segmento_lan: '192.168.100.0/24',
    });

    expect(assignments).toEqual(['ppp_user = ?', 'lan_subnets = ?', 'segmento_lan = ?']);
    expect(assignments.join(',')).not.toMatch(/nombre_vrf|nombre_nodo|iface_name/);
    expect(params[0]).toBe('WG-ND13-X');
    expect(params[1]).toBe('["192.168.100.0/24","192.168.30.0/24"]');
  });

  it('prepara un renombrado como actualización de la misma fila', () => {
    expect(buildNodeUpdate({ ppp_user: 'WG-ND13-NUEVO' })).toEqual({
      assignments: ['ppp_user = ?'], params: ['WG-ND13-NUEVO'],
    });
  });

  it('ignora campos desconocidos y valores undefined', () => {
    expect(buildNodeUpdate({ nombre_vrf: undefined, secreto: 'no', label: '' })).toEqual({
      assignments: ['label = ?'], params: [''],
    });
  });
});
