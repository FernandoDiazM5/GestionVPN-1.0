const {
  normalizeClaims,
  verifyFirebaseIdToken,
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
    }, config, 1000)).toEqual({
      provider: 'firebase',
      tenantKey: '',
      subject: 'firebase-uid-1',
      email: 'user@example.com',
      emailVerified: true,
      authTime: 900,
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
      }),
    };
    setAuthClientForTests(authClient);
    await expect(verifyFirebaseIdToken('firebase-id-token')).resolves.toMatchObject({
      subject: 'firebase-uid-1', email: 'user@example.com',
    });
    expect(authClient.verifyIdToken).toHaveBeenCalledWith('firebase-id-token', true);
  });
});
