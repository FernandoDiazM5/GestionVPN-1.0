const { normalizeCidr, normalizeCidrs, isCidr } = require('../../lib/ipv4Cidr');

describe('lib/ipv4Cidr', () => {
  it('valida octetos y prefijos estrictamente', () => {
    expect(normalizeCidr('999.1.1.1/24')).toBeNull();
    expect(normalizeCidr('10.0.0.1/33')).toBeNull();
    expect(normalizeCidr('10.0.0.1/x')).toBeNull();
  });

  it('normaliza bits de host y direcciones sueltas', () => {
    expect(normalizeCidr('142.152.7.91/24')).toBe('142.152.7.0/24');
    expect(normalizeCidr('10.2.3.4')).toBe('10.2.3.4/32');
  });

  it('bloquea la ruta por defecto y deduplica tras normalizar', () => {
    expect(normalizeCidr('0.0.0.0/0')).toBeNull();
    expect(normalizeCidrs(['10.0.0.1/24', '10.0.0.2/24'])).toEqual(['10.0.0.0/24']);
    expect(isCidr('10.0.0.1')).toBe(false);
  });
});
