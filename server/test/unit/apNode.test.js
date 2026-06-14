// ============================================================
//  test/unit/apNode.test.js — helper de relación AP → nodo (Fase 2-B)
// ============================================================
const { ipInCidr, resolveOwnerNodeId } = require('../../lib/apNode');

const NODES = [
  { id: 1, nombre_nodo: 'NODO-A', segmento_lan: '10.0.10.0/24' },
  { id: 2, nombre_nodo: 'NODO-B', segmento_lan: '10.0.50.0/24' },
];
const dbWithNodes = () => ({ all: vi.fn().mockResolvedValue(NODES) });

describe('ipInCidr', () => {
  it('true cuando la IP cae en el rango', () => {
    expect(ipInCidr('10.0.50.7', '10.0.50.0/24')).toBe(true);
    expect(ipInCidr('192.168.1.130', '192.168.1.128/25')).toBe(true);
  });
  it('false fuera del rango', () => {
    expect(ipInCidr('10.0.10.7', '10.0.50.0/24')).toBe(false);
    expect(ipInCidr('192.168.1.5', '192.168.1.128/25')).toBe(false);
  });
  it('false ante entradas inválidas', () => {
    expect(ipInCidr('', '10.0.0.0/24')).toBe(false);
    expect(ipInCidr('10.0.0.1', '')).toBe(false);
    expect(ipInCidr('no-ip', 'tampoco')).toBe(false);
  });
});

describe('resolveOwnerNodeId', () => {
  it('0. usa node_id persistido directo (sin consultar nodes)', async () => {
    const db = dbWithNodes();
    const id = await resolveOwnerNodeId(db, { node_id: 9, nombre_nodo: 'NODO-A', ip: '10.0.10.5' });
    expect(id).toBe(9);
    expect(db.all).not.toHaveBeenCalled();
  });
  it('1. resuelve por nombre_nodo exacto', async () => {
    const id = await resolveOwnerNodeId(dbWithNodes(), { nombre_nodo: 'NODO-B', ip: '10.0.10.5' });
    expect(id).toBe(2);
  });
  it('2. resuelve por subred cuando nombre_nodo no coincide', async () => {
    const id = await resolveOwnerNodeId(dbWithNodes(), { nombre_nodo: '', ip: '10.0.50.99' });
    expect(id).toBe(2);
  });
  it('null cuando nada resuelve', async () => {
    const id = await resolveOwnerNodeId(dbWithNodes(), { nombre_nodo: 'X', ip: '172.16.0.1' });
    expect(id).toBeNull();
  });
  it('null cuando no hay nodos', async () => {
    const id = await resolveOwnerNodeId({ all: vi.fn().mockResolvedValue([]) }, { ip: '10.0.50.1' });
    expect(id).toBeNull();
  });
});
