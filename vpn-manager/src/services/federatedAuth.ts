import type { SessionUser } from '../types/account';
import { federatedAuthConfig } from '../config/federatedAuth';
import { apiJson, type ApiError } from './sessionClient';

const FIREBASE_APP_NAME = 'gestionvpn-web-federated';
const GENERIC_BAD_CREDENTIALS = 'Correo o contraseña incorrectos';

type FirebaseAppModule = typeof import('firebase/app');
type FirebaseAuthModule = typeof import('firebase/auth');
type FirebaseAuth = ReturnType<FirebaseAuthModule['initializeAuth']>;

interface FirebaseRuntime {
  auth: FirebaseAuth;
  authModule: FirebaseAuthModule;
}

export interface GoogleLinkStatus {
  linked: boolean;
  email: string | null;
  linkedAt: number | null;
  lastVerifiedAt: number | null;
}

export interface GoogleLinkResult {
  linked: boolean;
  email?: string;
  message: string;
}

let runtimePromise: Promise<FirebaseRuntime> | null = null;

async function loadRuntime(): Promise<FirebaseRuntime> {
  const config = federatedAuthConfig;
  if (!config) throw new Error('Acceso federado no disponible');
  if (!runtimePromise) {
    runtimePromise = Promise.all([
      import('firebase/app'),
      import('firebase/auth'),
    ]).then(([appModule, authModule]: [FirebaseAppModule, FirebaseAuthModule]) => {
      const app = appModule.getApps().find(candidate => candidate.name === FIREBASE_APP_NAME)
        || appModule.initializeApp(config.client, FIREBASE_APP_NAME);
      const auth = authModule.initializeAuth(app, {
        persistence: authModule.inMemoryPersistence,
        popupRedirectResolver: authModule.browserPopupRedirectResolver,
      });
      if (config.tenantId) auth.tenantId = config.tenantId;
      return { auth, authModule };
    }).catch(error => {
      runtimePromise = null;
      throw error;
    });
  }
  return runtimePromise;
}

function publicMessage(error: unknown): string {
  const apiError = error as Partial<ApiError>;
  const firebaseCode = typeof apiError.code === 'string' ? apiError.code : '';
  if (firebaseCode === 'auth/popup-closed-by-user'
      || firebaseCode === 'auth/cancelled-popup-request') {
    return 'Inicio con Google cancelado';
  }
  if (firebaseCode === 'auth/popup-blocked') {
    return 'El navegador bloqueó la ventana de Google. Permite ventanas emergentes e inténtalo otra vez.';
  }
  if (firebaseCode === 'auth/unauthorized-domain') {
    return 'Este dominio no está autorizado en Firebase';
  }
  if (apiError.code === 'FEDERATED_AUTH_DISABLED' || apiError.status === 404) {
    return 'Acceso federado no disponible';
  }
  if (apiError.status === 429) return 'Demasiados intentos. Inténtalo nuevamente más tarde.';
  if (typeof apiError.status === 'number' && apiError.status >= 500) {
    return 'El servicio de acceso no está disponible temporalmente';
  }
  return GENERIC_BAD_CREDENTIALS;
}

function googleLinkMessage(error: unknown): string {
  const apiError = error as Partial<ApiError>;
  const firebaseCode = typeof apiError.code === 'string' ? apiError.code : '';
  if (firebaseCode === 'auth/operation-not-allowed'
      || firebaseCode === 'auth/configuration-not-found') {
    return 'Google no está habilitado correctamente en Firebase';
  }
  if (firebaseCode === 'auth/invalid-api-key') {
    return 'La configuración de Google no corresponde a este proyecto';
  }
  const message = publicMessage(error);
  return message === GENERIC_BAD_CREDENTIALS
    ? 'No se pudo conectar con Google. Inténtalo nuevamente.'
    : message;
}

async function withGoogleIdToken<T>(operation: (idToken: string) => Promise<T>): Promise<T> {
  let runtime: FirebaseRuntime | null = null;
  try {
    runtime = await loadRuntime();
    const provider = new runtime.authModule.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const credential = await runtime.authModule.signInWithPopup(
      runtime.auth,
      provider,
      runtime.authModule.browserPopupRedirectResolver,
    );
    const idToken = await credential.user.getIdToken(true);
    return await operation(idToken);
  } finally {
    if (runtime?.auth.currentUser) {
      await runtime.authModule.signOut(runtime.auth).catch(() => undefined);
    }
  }
}

export async function signInWithGoogle(): Promise<SessionUser> {
  try {
    return await withGoogleIdToken(async (idToken) => {
      const bootstrap = await apiJson<{ success: true; csrfToken: string }>(
        '/api/account/federated/csrf',
      );
      const exchanged = await apiJson<{ success: true; user: SessionUser }>(
        '/api/account/federated/exchange',
        {
          method: 'POST',
          headers: { 'X-CSRF-Token': bootstrap.csrfToken },
          body: JSON.stringify({ idToken }),
        },
      );
      return exchanged.user;
    });
  } catch (error) {
    throw new Error(publicMessage(error));
  }
}

export async function getGoogleLinkStatus(): Promise<GoogleLinkStatus> {
  return apiJson<{ success: true } & GoogleLinkStatus>('/api/account/federated/link-status');
}

export async function linkGoogleAccount(): Promise<GoogleLinkResult> {
  try {
    return await withGoogleIdToken((idToken) => apiJson<{ success: true } & GoogleLinkResult>(
      '/api/account/federated/link',
      {
        method: 'POST',
        body: JSON.stringify({ idToken }),
      },
    ));
  } catch (error) {
    const apiError = error as Partial<ApiError>;
    if (typeof apiError.status === 'number' && apiError.status < 500 && apiError.message) {
      throw new Error(apiError.message);
    }
    throw new Error(googleLinkMessage(error));
  }
}

export async function unlinkGoogleAccount(currentPassword: string): Promise<GoogleLinkResult> {
  try {
    return await apiJson<{ success: true } & GoogleLinkResult>(
      '/api/account/federated/unlink',
      { method: 'POST', body: JSON.stringify({ currentPassword }) },
    );
  } catch (error) {
    const apiError = error as Partial<ApiError>;
    if (typeof apiError.status === 'number' && apiError.status < 500 && apiError.message) {
      throw new Error(apiError.message);
    }
    throw new Error(publicMessage(error));
  }
}

// Defensa adicional para logout: no descarga Firebase si nunca se usó.
export async function clearFederatedClientSession(): Promise<void> {
  if (!runtimePromise) return;
  const runtime = await runtimePromise.catch(() => null);
  if (runtime?.auth.currentUser) await runtime.authModule.signOut(runtime.auth);
}
