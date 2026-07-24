const {
  normalizeClaims,
  verifyFirebaseIdToken,
  getFirebaseUser,
  probeFirebaseAuthAccess,
  revokeFirebaseSessions,
  resetForTests,
  setAuthClientForTests,
} = require('../../lib/firebaseIdentityProvider');

const config = {
  provider: 'firebase',
  tenantKey: '',
  maxAuthAgeSeconds: 300,
};

describe('firebaseIdentityProvider', () => {
  const original = {
    enabled: process.env.FEDERATED_AUTH_ENABLED,
    projectId: process.env.FIREBASE_PROJECT_ID,
  };

  afterEach(() => {
    resetForTests();
    if (original.enabled === undefined) delete process.env.FEDERATED_AUTH_ENABLED;
    else process.env.FEDERATED_AUTH_ENABLED = original.enabled;
    if (original.projectId === undefined) delete process.env.FIREBASE_PROJECT_ID;
    else process.env.FIREBASE_PROJECT_ID = original.projectId;
  });

  it('normaliza solo correo verificado y autenticacion reciente', () => {
    expect(normalizeClaims({
      uid: 'firebase-uid-1',
      email: ' User@Example.com ',
      email_verified: true,
      auth_time: 900,
      firebase: { sign_in_provider: 'google.com' },
    }, config, 1000)).toEqual({
      provider: 'firebase',
      tenantKey: '',
      subject: 'firebase-uid-1',
      email: 'user@example.com',
      emailVerified: true,
      authTime: 900,
      signInProvider: 'google.com',
    });
  });

  it.each([
    [{ uid: 'uid', email: 'u@example.com', email_verified: false, auth_time: 900 }],
    [{ uid: 'uid', email: 'u@example.com', email_verified: true, auth_time: 699 }],
    [{ uid: 'uid', email: 'u@example.com', email_verified: true, auth_time: 1031 }],
  ])('rechaza claims incompletos, antiguos o del futuro', claims => {
    expect(() => normalizeClaims(claims, config, 1000)).toThrow();
  });

  it('verifica revocacion con el Admin SDK antes de aceptar claims', async () => {
    process.env.FEDERATED_AUTH_ENABLED = 'true';
    process.env.FIREBASE_PROJECT_ID = 'gestion-vpn-pilot';
    const authClient = {
      verifyIdToken: vi.fn().mockResolvedValue({
        uid: 'firebase-uid-1',
        email: 'user@example.com',
        email_verified: true,
        auth_time: Math.floor(Date.now() / 1000),
        firebase: { sign_in_provider: 'google.com' },
      }),
    };
    setAuthClientForTests(authClient);
    await expect(verifyFirebaseIdToken('firebase-id-token')).resolves.toMatchObject({
      subject: 'firebase-uid-1', email: 'user@example.com',
    });
    expect(authClient.verifyIdToken).toHaveBeenCalledWith('firebase-id-token', true);
  });

  it('puede exigir que el token provenga del acceso con Google', async () => {
    process.env.FEDERATED_AUTH_ENABLED = 'true';
    process.env.FIREBASE_PROJECT_ID = 'gestion-vpn-pilot';
    setAuthClientForTests({
      verifyIdToken: vi.fn().mockResolvedValue({
        uid: 'firebase-uid-1',
        email: 'user@example.com',
        email_verified: true,
        auth_time: Math.floor(Date.now() / 1000),
        firebase: { sign_in_provider: 'password' },
      }),
    });
    await expect(verifyFirebaseIdToken('firebase-id-token', {
      requiredSignInProvider: 'google.com',
    })).rejects.toThrow('Proveedor de acceso no permitido');
  });

  it('expone operaciones administrativas minimas para preflight y rollback', async () => {
    process.env.FEDERATED_AUTH_ENABLED = 'true';
    process.env.FIREBASE_PROJECT_ID = 'gestion-vpn-pilot';
    const authClient = {
      getUser: vi.fn()
        .mockResolvedValueOnce({ uid: 'firebase-uid-1' })
        .mockRejectedValueOnce(Object.assign(new Error('not found'), { code: 'auth/user-not-found' })),
      revokeRefreshTokens: vi.fn().mockResolvedValue(undefined),
    };
    setAuthClientForTests(authClient);

    await expect(getFirebaseUser('firebase-uid-1')).resolves.toMatchObject({ uid: 'firebase-uid-1' });
    await expect(probeFirebaseAuthAccess()).resolves.toEqual({ reachable: true });
    await expect(revokeFirebaseSessions('firebase-uid-1')).resolves.toBeUndefined();
    expect(authClient.getUser).toHaveBeenLastCalledWith('__gestionvpn_preflight_nonexistent__');
  });
});
