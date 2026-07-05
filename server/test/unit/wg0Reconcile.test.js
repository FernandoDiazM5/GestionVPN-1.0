// ============================================================
//  wg0Reconcile.test.js — reconciliación de arranque de la intención del wg0.
//  Cubre allTowerLans(): extrae las LAN de la tabla `nodes` (segmento_lan +
//  lan_subnets JSON), deduplicadas y filtradas a CIDR válidos.
// ============================================================
const { stubModule, unstubModule } = require('../helpers/moduleMock');

const db = { all: vi.fn(), get: vi.fn(), run: vi.fn() };
stubModule(__dirname, '../../db.service', { getDb: vi.fn().mockResolvedValue(db) });
stubModule(__dirname, '../../lib/logger', {
  child: () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() }),
});

const { allTowerLans } = require('../../lib/wg0Reconcile');

afterAll(() => {
  unstubModule(__dirname, '../../db.service');
  unstubModule(__dirname, '../../lib/logger');
});

describe('lib/wg0Reconcile — allTowerLans', () => {
  it('extrae segmento_lan + lan_subnets, deduplica y filtra CIDR inválidos', async () => {
    db.all.mockResolvedValueOnce([
      { segmento_lan: '192.168.30.0/24', lan_subnets: '["10.1.1.0/24","192.168.30.0/24"]' },
      { segmento_lan: '142.152.7.0/24', lan_subnets: '[]' },
      { segmento_lan: 'no-es-cidr', lan_subnets: 'json-roto' },
      { segmento_lan: null, lan_subnets: null },
    ]);
    const lans = await allTowerLans();
    expect(lans).toContain('192.168.30.0/24');
    expect(lans).toContain('10.1.1.0/24');
    expect(lans).toContain('142.152.7.0/24');
    // dedup: 192.168.30.0/24 aparece en segmento_lan y en lan_subnets → una sola vez.
    expect(lans.filter((c) => c === '192.168.30.0/24')).toHaveLength(1);
    // 'no-es-cidr' y el JSON roto no se cuelan.
    expect(lans).not.toContain('no-es-cidr');
  });

  it('devuelve [] si no hay nodos', async () => {
    db.all.mockResolvedValueOnce([]);
    expect(await allTowerLans()).toEqual([]);
  });
});
