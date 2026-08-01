const fs = require('node:fs');
const path = require('node:path');
const configPath = path.resolve(__dirname, '../../../deploy/security-agent/gestionvpn-web-jails.conf');
const config = fs.readFileSync(configPath, 'utf8');

function jailBlock(name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = config.match(new RegExp(`\\[${escaped}\\]([\\s\\S]*?)(?=\\n\\[|$)`));
  return match?.[1] || '';
}

describe('configuración de jails web por vector', () => {
  const expected = [
    ['gestionvpn-web-auth', '-1'],
    ['gestionvpn-web-rate', '1h'],
    ['gestionvpn-web-scan', '6h'],
    ['gestionvpn-web-sensitive', '1h'],
    ['gestionvpn-web-recidive', '-1'],
  ];

  it.each(expected)('%s bloquea globalmente mediante UFW', (name, bantime) => {
    const block = jailBlock(name);
    expect(block).not.toBe('');
    expect(block).toMatch(/^enabled\s*=\s*true$/m);
    expect(block).toMatch(new RegExp(`^bantime\\s*=\\s*${bantime}$`, 'm'));
    expect(block).toMatch(/^action\s*=\s*ufw$/m);
  });

  it('mantiene el segundo nivel de escaneo por 24 horas', () => {
    const block = jailBlock('gestionvpn-web-scan-24h');
    expect(block).toMatch(/^bantime\s*=\s*24h$/m);
    expect(block).toMatch(/^action\s*=\s*ufw$/m);
  });
});
