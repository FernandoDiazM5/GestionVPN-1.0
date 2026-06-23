// ============================================================
//  test/unit/cpeScript.test.js — generador del script del CPE (WG)
//
//  Helper puro (sin BD ni red). Cubre el modelo de IP unificada y la
//  auto-generación de llaves (privada embebida vs flujo manual).
// ============================================================
const { buildCpeWgScript, buildCpeSstpScript, CORE_IFACE } = require('../../lib/cpeScript');

const base = {
  nodeNum: 2,
  nodeMgmt: '10.11.250.2',
  serverPublicKey: 'SRVPUB1234567890abcdefxx==',
  serverPublicIP: '203.0.113.10',
  wgPort: 13302,
  returnNets: ['10.13.250.0/24', '10.14.250.0/24', '10.11.252.0/24'],
};

describe('buildCpeWgScript', () => {
  it('embebe la privada cuando se autogenera el par', () => {
    const { script } = buildCpeWgScript({ ...base, cpePrivateKey: 'PRIV0987654321zzzz==' });
    expect(script).toContain(`/interface wireguard add name=${CORE_IFACE} private-key="PRIV0987654321zzzz=="`);
  });

  it('NO incluye private-key en modo manual (sin par generado)', () => {
    const { script } = buildCpeWgScript({ ...base, cpePrivateKey: '' });
    expect(script).not.toContain('private-key=');
    expect(script).toContain(`/interface wireguard add name=${CORE_IFACE} mtu=1420`);
  });

  it('usa la IP única del nodo (/32) — modelo unificado, sin /30 de transporte', () => {
    const { script } = buildCpeWgScript(base);
    expect(script).toContain('/ip address add address=10.11.250.2/32');
    expect(script).not.toContain('/30');
  });

  it('el peer apunta al Core con la pública del servidor + endpoint + puerto', () => {
    const { script } = buildCpeWgScript(base);
    expect(script).toContain('public-key="SRVPUB1234567890abcdefxx=="');
    expect(script).toContain('endpoint-address=203.0.113.10');
    expect(script).toContain('endpoint-port=13302');
    expect(script).toContain('persistent-keepalive=25s');
  });

  it('allowed-address agrupa todas las redes de retorno', () => {
    const { script } = buildCpeWgScript(base);
    expect(script).toContain('allowed-address=10.13.250.0/24,10.14.250.0/24,10.11.252.0/24');
  });

  it('crea una ruta de retorno por cada red (gestión + scan-pool)', () => {
    const { script, cpeSteps } = buildCpeWgScript(base);
    for (const net of base.returnNets) {
      expect(script).toContain(`/ip route add dst-address=${net}`);
    }
    // 3 pasos fijos (interfaz, IP, peer) + 1 por red de retorno
    expect(cpeSteps).toHaveLength(3 + base.returnNets.length);
  });

  it('cae a placeholder si falta la pública del servidor', () => {
    const { script } = buildCpeWgScript({ ...base, serverPublicKey: '' });
    expect(script).toContain('public-key="<CLAVE_PUBLICA_SERVIDOR>"');
  });
});

describe('buildCpeSstpScript', () => {
  const sstp = { pppUser: 'ppp-torrex-nd2', pppPassword: 'Secret20charsXXXXXXX', serverPublicIP: '203.0.113.10' };

  it('embebe usuario + contraseña + endpoint en el cliente SSTP', () => {
    const { script } = buildCpeSstpScript(sstp);
    expect(script).toContain('user=ppp-torrex-nd2');
    expect(script).toContain('password=Secret20charsXXXXXXX');
    expect(script).toContain('connect-to=203.0.113.10');
  });

  it('es idempotente (crea si no existe, si no actualiza) y no lleva rutas de retorno', () => {
    const { script, cpeSteps } = buildCpeSstpScript(sstp);
    expect(script).toContain(':if ([find name=sstp-out1] = "") do={');
    expect(script).toContain('} else={');
    expect(script).not.toContain('/ip route add');     // SSTP no requiere ruta de retorno
    expect(cpeSteps).toHaveLength(1);
  });

  it('sin puerto (o 443) usa connect-to sin sufijo de puerto (default RouterOS)', () => {
    expect(buildCpeSstpScript(sstp).script).toContain('connect-to=203.0.113.10 ');
    expect(buildCpeSstpScript({ ...sstp, sstpPort: 443 }).script).toContain('connect-to=203.0.113.10 ');
    expect(buildCpeSstpScript(sstp).script).not.toContain('203.0.113.10:');
  });

  it('con puerto distinto de 443 lo anexa a connect-to (add y set)', () => {
    const { script } = buildCpeSstpScript({ ...sstp, sstpPort: 4443 });
    expect(script).toContain('connect-to=203.0.113.10:4443 disabled=no http-proxy=0.0.0.0');
    expect(script).toContain('set [find name=sstp-out1] connect-to=203.0.113.10:4443');
  });

  it('ignora un puerto inválido y cae a connect-to sin puerto', () => {
    expect(buildCpeSstpScript({ ...sstp, sstpPort: 'abc' }).script).toContain('connect-to=203.0.113.10 ');
    expect(buildCpeSstpScript({ ...sstp, sstpPort: '' }).script).toContain('connect-to=203.0.113.10 ');
  });
});
