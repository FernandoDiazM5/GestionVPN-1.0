import { describe, expect, it } from 'vitest';
import { compareIpAddresses } from './useDeviceList';

describe('compareIpAddresses', () => {
  it('ordena IPv4 por sus octetos numéricos', () => {
    const addresses = [
      '192.168.30.200',
      '192.168.30.19',
      '192.168.30.2',
      '10.0.0.50',
      '192.168.30.100',
    ];

    expect(addresses.sort(compareIpAddresses)).toEqual([
      '10.0.0.50',
      '192.168.30.2',
      '192.168.30.19',
      '192.168.30.100',
      '192.168.30.200',
    ]);
  });

  it('coloca valores no IPv4 después de las direcciones válidas', () => {
    expect(['sin-ip', '192.168.1.5', '999.1.1.1'].sort(compareIpAddresses)).toEqual([
      '192.168.1.5',
      '999.1.1.1',
      'sin-ip',
    ]);
  });
});
