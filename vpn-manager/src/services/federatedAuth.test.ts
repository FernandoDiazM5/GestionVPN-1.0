import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const auth = { currentUser: null as object | null, tenantId: null as string | null };
  return {
    auth,
    apiJson: vi.fn(),
    getApps: vi.fn(() => []),
    initializeApp: vi.fn((_config: unknown, _name: string) => ({ name: 'gestionvpn-web-federated' })),
    initializeAuth: vi.fn((_app: unknown, _options: unknown) => auth),
    signIn: vi.fn(),
    signOut: vi.fn(async (_auth: unknown) => { auth.currentUser = null; }),
    getIdToken: vi.fn(),
  };
});

vi.mock('../config/federatedAuth', () => ({
  federatedAuthConfig: {
    client: {
      apiKey: 'public-api-key',
      authDomain: 'gestion-vpn-pilot.firebaseapp.com',
      projectId: 'gestion-vpn-pilot',
      appId: '1:123:web:abc',
    },
    tenantId: 'tenant-1',
  },
}));

vi.mock('./sessionClient', () => ({
  apiJson: (...args: unknown[]) => mocks.apiJson(...args),
}));

vi.mock('firebase/app', () => ({
  getApps: () => mocks.getApps(),
  initializeApp: (config: unknown, name: string) => mocks.initializeApp(config, name),
}));

vi.mock('firebase/auth', () => ({
  inMemoryPersistence: { type: 'NONE' },
  initializeAuth: (app: unknown, options: unknown) => mocks.initializeAuth(app, options),
  signInWithEmailAndPassword: (auth: unknown, email: string, password: string) =>
    mocks.signIn(auth, email, password),
  signOut: (auth: unknown) => mocks.signOut(auth),
}));

import { signInWithFirebase } from './federatedAuth';

const sessionUser = {
  id: 'user-1',
  email: 'user@example.com',
  role: 'OWNER' as const,
  workspace_id: 'ws-1',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.currentUser = null;
  mocks.getIdToken.mockResolvedValue('firebase-id-token');
  mocks.signIn.mockImplementation(async () => {
    mocks.auth.currentUser = {};
    return { user: { getIdToken: mocks.getIdToken } };
  });
  mocks.apiJson.mockImplementation(async (path: string) => {
    if (path.endsWith('/csrf')) return { success: true, csrfToken: 'federated-csrf' };
    return { success: true, user: sessionUser };
  });
});

describe('signInWithFirebase', () => {
  it('usa memoria, intercambia el token y borra la sesión Firebase inmediatamente', async () => {
    await expect(signInWithFirebase(' User@Example.com ', 'password-seguro'))
      .resolves.toEqual(sessionUser);

    expect(mocks.initializeAuth).toHaveBeenCalledWith(
      expect.anything(),
      { persistence: { type: 'NONE' } },
    );
    expect(mocks.auth.tenantId).toBe('tenant-1');
    expect(mocks.signIn).toHaveBeenCalledWith(mocks.auth, 'user@example.com', 'password-seguro');
    expect(mocks.getIdToken).toHaveBeenCalledWith(true);
    expect(mocks.apiJson).toHaveBeenNthCalledWith(1, '/api/account/federated/csrf');
    expect(mocks.apiJson).toHaveBeenNthCalledWith(
      2,
      '/api/account/federated/exchange',
      expect.objectContaining({
        method: 'POST',
        headers: { 'X-CSRF-Token': 'federated-csrf' },
      }),
    );
    expect(mocks.signOut).toHaveBeenCalledWith(mocks.auth);
  });

  it('no expone el error específico de Firebase', async () => {
    mocks.signIn.mockRejectedValueOnce(Object.assign(new Error('user-not-found'), {
      code: 'auth/user-not-found',
    }));
    await expect(signInWithFirebase('missing@example.com', 'password-seguro'))
      .rejects.toThrow('Correo o contraseña incorrectos');
  });
});
