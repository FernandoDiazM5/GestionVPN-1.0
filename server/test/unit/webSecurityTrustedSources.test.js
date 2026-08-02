const trustedSources = require('../../lib/webSecurityTrustedSources');

describe('orígenes críticos de seguridad web', () => {
  it('protege exactamente la IP del VPS, el endpoint WireGuard y extras válidos', () => {
    const env = {
      VPS_PUBLIC_IP: '134.199.212.232',
      WG_PUBLIC_IP: '213.173.36.232',
      WEB_SECURITY_SYSTEM_TRUSTED_IPS: '198.51.100.8,valor-inválido,198.51.100.8',
    };
    expect(trustedSources.systemTrustedIps(env)).toEqual([
      '134.199.212.232', '213.173.36.232', '198.51.100.8',
    ]);
    expect(trustedSources.systemTrustedCidrs(env)).toEqual([
      '134.199.212.232/32', '213.173.36.232/32', '198.51.100.8/32',
    ]);
    expect(trustedSources.isSystemTrustedIp('::ffff:134.199.212.232', env)).toBe(true);
    expect(trustedSources.isSystemTrustedIp('198.51.100.9', env)).toBe(false);
  });

  it('protege siempre loopback sin ampliar confianza a una red', () => {
    expect(trustedSources.isSystemTrustedIp('127.0.0.8', {})).toBe(true);
    expect(trustedSources.isSystemTrustedIp('::1', {})).toBe(true);
    expect(trustedSources.isSystemTrustedIp('127.1.2.3', {})).toBe(true);
    expect(trustedSources.isSystemTrustedIp('128.0.0.1', {})).toBe(false);
  });
});
