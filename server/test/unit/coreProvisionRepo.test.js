const { safeSteps } = require('../../db/repos/coreProvisionRepo');

describe('coreProvisionRepo', () => {
  it('conserva únicamente nombre y estado permitido de cada paso', () => {
    expect(safeSteps([
      { name: 'Peer VPS', status: 'CREATED', password: 'no-debe-salir' },
      { name: 'Firewall', status: 'EXISTS', command: '/ip/firewall/add' },
    ])).toEqual([
      { name: 'Peer VPS', status: 'CREATED' },
      { name: 'Firewall', status: 'EXISTS' },
    ]);
  });

  it('normaliza estados desconocidos y entradas inválidas', () => {
    expect(safeSteps([{ name: 'Paso', status: 'UNKNOWN' }, null])).toEqual([
      { name: 'Paso', status: 'FAILED' },
      { name: '', status: 'FAILED' },
    ]);
  });
});
