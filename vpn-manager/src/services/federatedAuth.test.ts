import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const auth = { currentUser: null as object | null, tenantId: null as string | null };
  return {
    auth,
    apiJson: vi.fn(),
    getApps: vi.fn(() => []),
    initializeApp: vi.fn((_config: unknown, _name: string) => ({ name: 'gestionvpn-web-federated' })),
    initializeAuth: vi.fn((_app: unknown, _options: unknown) => auth),
    popupRedirectResolver: { type: 'browser-popup' },
    signIn: vi.fn(),
    setCustomParameters: vi.fn(),
    signOut: vi.fn(async (_auth: unknown) => { auth.currentUser = null; }),
    getIdToken: vi.fn(),
  };
});

vi.mock('../config/federatedAuth', () => {
  const config = {
    client: {
      apiKey: 'public-api-key',
      authDomain: 'gestion-vpn-pilot.firebaseapp.com',
      projectId: 'gestion-vpn-pilot',
      appId: '1:123:web:abc',
    },
    tenantId: 'tenant-1',
  };
  return { federatedAuthConfig: config, getFederatedAuthConfig: vi.fn().mockResolvedValue(config) };
});

vi.mock('./sessionClient', () => ({
  apiJson: (...args: unknown[]) => mocks.apiJson(...args),
}));

vi.mock('firebase/app', () => ({
  getApps: () => mocks.getApps(),
  initializeApp: (config: unknown, name: string) => mocks.initializeApp(config, name),
}));

vi.mock('firebase/auth', () => ({
  inMemoryPersistence: { type: 'NONE' },
  browserPopupRedirectResolver: mocks.popupRedirectResolver,
  initializeAuth: (app: unknown, options: unknown) => mocks.initializeAuth(app, options),
  GoogleAuthProvider: class {
    setCustomParameters(parameters: unknown) { mocks.setCustomParameters(parameters); }
  },
  signInWithPopup: (auth: unknown, provider: unknown) => mocks.signIn(auth, provider),
  signOut: (auth: unknown) => mocks.signOut(auth),
}));

import {
  getGoogleLinkStatus,
  linkGoogleAccount,
  signInWithGoogle,
  unlinkGoogleAccount,
} from './federatedAuth';

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
    if (path.endsWith('/link-status')) {
      return { success: true, linked: false, email: null, linkedAt: null, lastVerifiedAt: null };
    }
    if (path.endsWith('/link')) {
      return { success: true, linked: true, email: 'user@example.com', message: 'Cuenta vinculada' };
    }
    if (path.endsWith('/unlink')) {
      return { success: true, linked: false, message: 'Cuenta desvinculada' };
    }
    return { success: true, user: sessionUser };
  });
});

describe('autenticación con Google', () => {
  it('usa memoria, intercambia el token y borra la sesión Firebase inmediatamente', async () => {
    await expect(signInWithGoogle()).resolves.toEqual(sessionUser);

    expect(mocks.initializeAuth).toHaveBeenCalledWith(
      expect.anything(),
      {
        persistence: { type: 'NONE' },
        popupRedirectResolver: { type: 'browser-popup' },
      },
    );
    expect(mocks.auth.tenantId).toBe('tenant-1');
    expect(mocks.setCustomParameters).toHaveBeenCalledWith({ prompt: 'select_account' });
    expect(mocks.signIn).toHaveBeenCalledWith(mocks.auth, expect.anything());
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
    await expect(signInWithGoogle())
      .rejects.toThrow('Correo o contraseña incorrectos');
  });

  it('captura el UID mediante Google y envía sólo el token al backend', async () => {
    await expect(linkGoogleAccount()).resolves.toMatchObject({
      linked: true, email: 'user@example.com',
    });
    expect(mocks.apiJson).toHaveBeenCalledWith(
      '/api/account/federated/link',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ idToken: 'firebase-id-token' }),
      }),
    );
    expect(mocks.signOut).toHaveBeenCalledWith(mocks.auth);
  });

  it('explica la configuración incorrecta al enlazar sin mencionar contraseñas', async () => {
    mocks.signIn.mockRejectedValueOnce(Object.assign(new Error('provider-disabled'), {
      code: 'auth/operation-not-allowed',
    }));
    await expect(linkGoogleAccount())
      .rejects.toThrow('Google no está habilitado correctamente en Firebase');
  });

  it('consulta el estado y desvincula sin exponer el UID al cliente', async () => {
    await expect(getGoogleLinkStatus()).resolves.toMatchObject({ linked: false });
    await expect(unlinkGoogleAccount('password-local')).resolves.toMatchObject({ linked: false });
    expect(mocks.apiJson).toHaveBeenCalledWith(
      '/api/account/federated/unlink',
      { method: 'POST', body: JSON.stringify({ currentPassword: 'password-local' }) },
    );
  });
});
