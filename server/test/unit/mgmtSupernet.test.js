import { describe, it, expect, beforeEach } from 'vitest';

const mgmtNet = require('../../lib/mgmtNet');

describe('bloque /22 de gestión inicial', () => {
  beforeEach(() => {
    mgmtNet.supernet.net = '';
  });

  it('deriva cuatro /24 consecutivos con el orden operativo acordado', () => {
    expect(mgmtNet.deriveSupernet('10.12.248.0/22')).toMatchObject({
      scanNet: '10.12.248.0/24',
      clientsNet: '10.12.249.0/24',
      vpsNet: '10.12.250.0/24',
      adminNet: '10.12.251.0/24',
    });
  });

  it('rechaza bloques no alineados, públicos o con otra máscara', () => {
    expect(mgmtNet.deriveSupernet('10.12.249.0/22')).toBeNull();
    expect(mgmtNet.deriveSupernet('192.168.0.0/22')).toBeNull();
    expect(mgmtNet.deriveSupernet('10.12.248.0/24')).toBeNull();
  });

  it('resume en una ruta remota sin combinar los gateways internos del Core', () => {
    mgmtNet.configureSupernet('10.12.248.0/22');
    expect(mgmtNet.remoteReturnNets()).toEqual(['10.12.248.0/22']);
    expect(mgmtNet.returnRoutes()).toEqual([
      expect.objectContaining({ subnet: '10.12.249.0/24', gateway: mgmtNet.clients.iface }),
      expect.objectContaining({ subnet: '10.12.251.0/24', gateway: mgmtNet.admin.iface }),
      expect.objectContaining({ subnet: '10.12.250.0/24', gateway: mgmtNet.vps.iface }),
    ]);
  });
});
