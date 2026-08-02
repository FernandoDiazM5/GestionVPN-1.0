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

  it('adds report-only CSP and a strict referrer policy without inline bootstrap code', () => {
    const nginxSource = fs.readFileSync(path.join(repoRoot, 'vpn-manager', 'nginx.prod.conf'), 'utf8');
    const headersSource = fs.readFileSync(path.join(repoRoot, 'vpn-manager', 'gestionvpn-security-headers.conf'), 'utf8');
    const indexSource = fs.readFileSync(path.join(repoRoot, 'vpn-manager', 'index.html'), 'utf8');
    const dockerfileSource = fs.readFileSync(path.join(repoRoot, 'vpn-manager', 'Dockerfile.prod'), 'utf8');

    expect(nginxSource).toContain('include /etc/nginx/snippets/gestionvpn-security-headers.conf;');
    expect(headersSource).toContain('add_header Referrer-Policy "no-referrer" always;');
    expect(headersSource).toContain('add_header Content-Security-Policy-Report-Only');
    expect(headersSource).toContain("script-src 'self'");
    expect(indexSource).toContain('<script src="%BASE_URL%theme-init.js"></script>');
    expect(indexSource).not.toMatch(/<script>(.|\n)*?<\/script>/);
    expect(dockerfileSource).toContain('gestionvpn-security-headers.conf /etc/nginx/snippets/gestionvpn-security-headers.conf');
  });
});
