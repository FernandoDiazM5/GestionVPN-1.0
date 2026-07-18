const { stubModule } = require('../helpers/moduleMock');

const repoMocks = stubModule(__dirname, '../../db/repos/authSessionRepo', {
  create: vi.fn(),
  rotate: vi.fn(),
  replaceAll: vi.fn(),
  revoke: vi.fn(),
  revokeAll: vi.fn(),
});

const { issueSession, rotateSession, replaceAllSessions } = require('../../lib/sessionService');
const { verifySession } = require('../../lib/jwt');

const identity = {
  sub: 'user-1',
  email: 'user@example.com',
  workspace_id: 'ws-1',
  role: 'OWNER',
  platform_admin: false,
};

beforeEach(() => vi.clearAllMocks());

describe('sessionService', () => {
  it('registra cada JWT nuevo por jti antes de entregarlo', async () => {
    const session = await issueSession(identity);
    const claims = verifySession(session.token);
    expect(claims.jti).toEqual(expect.any(String));
    expect(repoMocks.create).toHaveBeenCalledWith({
      jti: claims.jti,
      userId: 'user-1',
      expiresAt: Number(claims.exp) * 1000,
    });
  });

  it('renovación rota el jti y revoca atómicamente el anterior', async () => {
    const current = { ...identity, jti: 'old-jti', iat: 1, exp: 2 };
    const renewed = await rotateSession(current);
    expect(renewed.claims.jti).not.toBe('old-jti');
    expect(repoMocks.rotate).toHaveBeenCalledWith(expect.objectContaining({
      previousJti: 'old-jti', userId: 'user-1', jti: renewed.claims.jti,
    }));
  });

  it('un cambio sensible revoca todas las sesiones y conserva sólo la nueva', async () => {
    const renewed = await replaceAllSessions({ ...identity, jti: 'old-jti' }, { email: 'new@example.com' });
    expect(renewed.claims.email).toBe('new@example.com');
    expect(repoMocks.replaceAll).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1', jti: renewed.claims.jti,
    }));
  });
});
