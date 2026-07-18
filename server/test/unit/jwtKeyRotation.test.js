const { execFileSync } = require('node:child_process');
const path = require('node:path');

describe('JWT key rotation', () => {
  it('firma con el kid activo y acepta temporalmente el kid anterior', () => {
    const serverDir = path.join(__dirname, '..', '..');
    const script = `
      const jwt = require('jsonwebtoken');
      const session = require('./lib/jwt');
      const old = jwt.sign(
        { sub:'u', workspace_id:'w', role:'OWNER', platform_admin:false, jti:'old-jti' },
        process.env.JWT_PREVIOUS_SECRET,
        { algorithm:'HS256', expiresIn:'5m', issuer:'gestionvpn-api', audience:'gestionvpn-web', header:{ kid:'old-2026' } }
      );
      if (session.verifySession(old).jti !== 'old-jti') process.exit(2);
      const fresh = session.signSession({ sub:'u', workspace_id:'w', role:'OWNER' });
      if (jwt.decode(fresh, { complete:true }).header.kid !== 'new-2026') process.exit(3);
      process.stdout.write('ok');
    `;
    const output = execFileSync(process.execPath, ['-e', script], {
      cwd: serverDir,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        JWT_ACTIVE_KID: 'new-2026',
        JWT_ACTIVE_SECRET: 'a'.repeat(64),
        JWT_PREVIOUS_KID: 'old-2026',
        JWT_PREVIOUS_SECRET: 'b'.repeat(64),
      },
      encoding: 'utf8',
    });
    expect(output).toBe('ok');
  });
});
