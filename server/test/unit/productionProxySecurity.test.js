const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..', '..');

describe('production proxy security', () => {
  it('keeps Express and nginx on one exact trusted hop', () => {
    const indexSource = fs.readFileSync(path.join(repoRoot, 'server', 'index.js'), 'utf8');
    const nginxSource = fs.readFileSync(path.join(repoRoot, 'vpn-manager', 'nginx.prod.conf'), 'utf8');

    expect(indexSource).toContain("app.set('trust proxy', 1)");
    expect(nginxSource).toContain('X-Forwarded-For   $remote_addr');
    expect(nginxSource).not.toContain('$proxy_add_x_forwarded_for');
  });

  it('applies a coarse nginx zone only to public identity routes', () => {
    const nginxSource = fs.readFileSync(path.join(repoRoot, 'vpn-manager', 'nginx.prod.conf'), 'utf8');

    expect(nginxSource).toContain('limit_req_zone $auth_limit_key');
    expect(nginxSource).toContain('~^/api/auth/(setup|login)$');
    expect(nginxSource).toContain('~^/api/account/(login|register|verify|resend)$');
    expect(nginxSource).toContain('~^/api/team/accept$');
  });
});
