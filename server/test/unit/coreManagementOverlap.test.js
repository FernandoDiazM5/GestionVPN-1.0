const { unexpectedManagementOverlaps } = require('../../lib/coreServerService');
const mgmtNet = require('../../lib/mgmtNet');

describe('solapamientos del Core durante transición /22', () => {
  it('acepta las tres subredes esperadas en sus interfaces correctas', () => {
    expect(unexpectedManagementOverlaps([
      { interface: mgmtNet.vps.iface, address: '10.12.250.1/24' },
      { interface: mgmtNet.clients.iface, address: '10.12.249.1/24' },
      { interface: mgmtNet.admin.iface, address: '10.12.251.1/24' },
    ], mgmtNet.deriveSupernet('10.12.248.0/22'))).toEqual([]);
  });

  it('bloquea una dirección del /22 en una interfaz ajena', () => {
    expect(unexpectedManagementOverlaps([
      { interface: 'ether2', address: '10.12.249.10/24' },
    ], mgmtNet.deriveSupernet('10.12.248.0/22'))).toHaveLength(1);
  });
});
