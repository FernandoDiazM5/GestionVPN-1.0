// ============================================================
//  test/unit/wgkeys.test.js — helpers puros de WireGuard
//
//  No dependen de BD ni red — solo Node crypto. Test rápido y estable.
// ============================================================
const { generateKeyPair, buildClientConf } = require('../../lib/wgkeys');

describe('generateKeyPair', () => {
  it('produce un par X25519 codificado en base64 (44 chars con padding)', () => {
    const { publicKey, privateKey } = generateKeyPair();
    expect(publicKey).toMatch(/^[A-Za-z0-9+/]{43}=$/);
    expect(privateKey).toMatch(/^[A-Za-z0-9+/]{43}=$/);
  });

  it('cada llamada produce un par distinto (no determinista)', () => {
    const a = generateKeyPair();
    const b = generateKeyPair();
    expect(a.publicKey).not.toBe(b.publicKey);
    expect(a.privateKey).not.toBe(b.privateKey);
  });

  it('public y private del mismo par son distintos', () => {
    const { publicKey, privateKey } = generateKeyPair();
    expect(publicKey).not.toBe(privateKey);
  });
});

describe('buildClientConf', () => {
  const baseParams = {
    privateKey: 'PRIVKEY1234567890abcdef==',
    address: '10.13.250.50',
    serverPublicKey: 'SRVPUB1234567890abcdefxx==',
    endpoint: '203.0.113.10:13231',
    allowedIps: '10.0.0.0/8, 192.168.0.0/16', // split-tunnel de gestión
  };

  it('genera un .conf con secciones [Interface] y [Peer]', () => {
    const conf = buildClientConf(baseParams);
    expect(conf).toContain('[Interface]');
    expect(conf).toContain('[Peer]');
  });

  it('usa el DNS default 8.8.8.8 y PersistentKeepalive', () => {
    const conf = buildClientConf(baseParams);
    expect(conf).toContain('DNS = 8.8.8.8');
    expect(conf).toContain('PersistentKeepalive = 25');
  });

  it('lanza si falta allowedIps (NUNCA 0.0.0.0/0 en túnel de gestión — §4.10)', () => {
    expect(() => buildClientConf({ ...baseParams, allowedIps: undefined })).toThrow(/allowedIps/);
    expect(() => buildClientConf({ ...baseParams, allowedIps: '   ' })).toThrow(/allowedIps/);
  });

  it('agrega /32 al Address (asume IP única, no subred)', () => {
    const conf = buildClientConf(baseParams);
    expect(conf).toContain('Address = 10.13.250.50/32');
  });

  it('respeta overrides de allowedIps y dns', () => {
    const conf = buildClientConf({ ...baseParams, allowedIps: '10.13.250.0/24', dns: '1.1.1.1' });
    expect(conf).toContain('AllowedIPs = 10.13.250.0/24');
    expect(conf).toContain('DNS = 1.1.1.1');
  });

  it('incluye PrivateKey y Endpoint pasados como argumento', () => {
    const conf = buildClientConf(baseParams);
    expect(conf).toContain('PrivateKey = PRIVKEY1234567890abcdef==');
    expect(conf).toContain('Endpoint = 203.0.113.10:13231');
    expect(conf).toContain('PublicKey = SRVPUB1234567890abcdefxx==');
  });
});
