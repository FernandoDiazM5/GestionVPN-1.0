import { describe, it, expect, vi, beforeEach } from 'vitest';
const { stubModule } = require('../helpers/moduleMock');

stubModule(__dirname, '../../db/mysql', { query: vi.fn(), withTransaction: vi.fn() });
const mgmtNet = require('../../lib/mgmtNet');
const {
  prefixFromNetmask, localInterfaceCidrs, previewManagementSupernet, saveManagementSupernet,
} = require('../../lib/managementNetworkService');

describe('managementNetworkService', () => {
  beforeEach(() => { mgmtNet.supernet.net = ''; });

  it('convierte netmask e interfaces IPv4 en CIDR canónico', () => {
    expect(prefixFromNetmask('255.255.255.0')).toBe(24);
    expect(prefixFromNetmask('255.255.253.0')).toBeNull();
    expect(localInterfaceCidrs({ Ethernet: [{ family: 'IPv4', internal: false, address: '192.168.1.20', netmask: '255.255.255.0' }] }))
      .toEqual([{ source: 'HOST', name: 'Ethernet', cidr: '192.168.1.0/24' }]);
  });

  it('devuelve el plan autoritativo cuando no existen bloqueos ni solapamientos', async () => {
    const queryFn = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const preview = await previewManagementSupernet('10.12.248.0/22', { queryFn, interfaces: {} });
    expect(preview).toMatchObject({ valid: true, canSave: true, locked: false });
    expect(preview.plan).toMatchObject({
      scanNet: '10.12.248.0/24', clientsNet: '10.12.249.0/24',
      vpsNet: '10.12.250.0/24', adminNet: '10.12.251.0/24',
    });
  });

  it('bloquea solapamientos con el host y redes de sitios', async () => {
    const queryFn = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ nombre_nodo: 'ND2', lan_subnets: '["10.20.0.0/24"]' }]);
    const preview = await previewManagementSupernet('10.20.0.0/22', {
      queryFn,
      interfaces: { wg0: [{ family: 'IPv4', internal: false, address: '10.20.1.60', cidr: '10.20.1.60/32' }] },
    });
    expect(preview.canSave).toBe(false);
    expect(preview.overlaps).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'HOST' }), expect.objectContaining({ source: 'SITE' }),
    ]));
  });

  it('no trata la dirección administrada de wg0 como solapamiento externo', async () => {
    const queryFn = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const preview = await previewManagementSupernet('10.12.248.0/22', {
      queryFn,
      interfaces: { wg0: [{ family: 'IPv4', internal: false, address: '10.12.250.60', cidr: '10.12.250.60/32' }] },
    });
    expect(preview).toMatchObject({ valid: true, canSave: true, overlaps: [] });
  });

  it('mantiene el bloqueo si wg0 usa otra dirección dentro del bloque', async () => {
    const queryFn = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const preview = await previewManagementSupernet('10.12.248.0/22', {
      queryFn,
      interfaces: { wg0: [{ family: 'IPv4', internal: false, address: '10.12.250.61', cidr: '10.12.250.61/32' }] },
    });
    expect(preview.canSave).toBe(false);
    expect(preview.overlaps).toEqual([expect.objectContaining({ source: 'HOST', name: 'wg0' })]);
  });

  it('guarda setting, scan-IP y auditoría dentro de una sola transacción', async () => {
    const queryFn = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const tx = { query: vi.fn() };
    tx.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ workspace_id: 'ws-1', scan_ip: '10.11.252.7' }])
      .mockResolvedValueOnce({ affectedRows: 1 })
      .mockResolvedValueOnce({ affectedRows: 1 })
      .mockResolvedValueOnce({ affectedRows: 1 });
    const transaction = vi.fn(async fn => fn(tx));
    const result = await saveManagementSupernet({
      cidr: '10.12.248.0/22', actorUserId: 'admin-1', requestIp: '127.0.0.1',
    }, { queryFn, transaction, interfaces: {} });
    expect(result.migratedScanAssignments).toBe(1);
    expect(tx.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE workspace_scan_ip'), [
      '10.12.248.7', expect.any(Number), 'ws-1',
    ]);
    expect(tx.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO app_settings'), [
      'management_supernet', '10.12.248.0/22', expect.any(Number),
    ]);
    expect(tx.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO platform_security_audit'), expect.arrayContaining([
      expect.any(String), 'admin-1', 'MGMT_SUPERNET_SET', '10.12.248.0/22',
    ]));
  });

  it('propaga el fallo y no activa la configuración en memoria', async () => {
    const queryFn = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const transaction = vi.fn().mockRejectedValue(new Error('rollback'));
    await expect(saveManagementSupernet({ cidr: '10.12.248.0/22', actorUserId: 'admin-1' }, {
      queryFn, transaction, interfaces: {},
    })).rejects.toThrow('rollback');
    expect(mgmtNet.supernet.net).toBe('');
  });
});
