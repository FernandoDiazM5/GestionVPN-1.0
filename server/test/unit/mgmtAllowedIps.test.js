const { mgmtAllowedIpsFor } = require('../../lib/mgmtAllowedIps');

// workspaceId=null → no consulta BD; prueba el merge base + address-list puro.
describe('lib/mgmtAllowedIps — split-tunnel dinámico desde el address-list', () => {
  it('sin address-list → solo la base RFC1918', async () => {
    const out = await mgmtAllowedIpsFor(null);
    expect(out).toContain('10.0.0.0/8');
    expect(out).toContain('192.168.0.0/16');
    expect(out).not.toContain('0.0.0.0/0');
  });

  it('añade SOLO las LAN públicas del address-list (las privadas ya están en la base)', async () => {
    const out = await mgmtAllowedIpsFor(null, {
      addressList: ['10.1.1.0/24', '192.168.30.0/24', '142.152.7.0/24', '142.153.0.0/24'],
    });
    expect(out).toContain('142.152.7.0/24');   // pública → añadida
    expect(out).toContain('142.153.0.0/24');   // pública → añadida
    // privadas NO se duplican (cubiertas por la base)
    expect(out).not.toMatch(/10\.1\.1\.0\/24/);
    expect(out).not.toMatch(/192\.168\.30\.0\/24/);
  });

  it('ignora entradas que no son CIDR', async () => {
    const out = await mgmtAllowedIpsFor(null, { addressList: ['basura', '', '142.152.7.0/24'] });
    expect(out).toContain('142.152.7.0/24');
    expect(out).not.toContain('basura');
  });

  it('nunca incluye 0.0.0.0/0 ni 0.0.0.0/1', async () => {
    const out = await mgmtAllowedIpsFor(null, { addressList: ['142.152.7.0/24'] });
    expect(out).not.toContain('0.0.0.0/0');
    expect(out).not.toContain('0.0.0.0/1');
  });
});
