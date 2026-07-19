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
  if (apiError.code === 'FEDERATED_AUTH_DISABLED' || apiError.status === 404) {
    return 'Acceso federado no disponible';
  }
  if (apiError.status === 429) return 'Demasiados intentos. Inténtalo nuevamente más tarde.';
  if (typeof apiError.status === 'number' && apiError.status >= 500) {
    return 'El servicio de acceso no está disponible temporalmente';
  }
  return GENERIC_BAD_CREDENTIALS;
}

export async function signInWithFirebase(email: string, password: string): Promise<SessionUser> {
  let runtime: FirebaseRuntime | null = null;
  try {
    runtime = await loadRuntime();
    const credential = await runtime.authModule.signInWithEmailAndPassword(
      runtime.auth,
      email.trim().toLowerCase(),
      password,
    );
    const idToken = await credential.user.getIdToken(true);
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
  } catch (error) {
    throw new Error(publicMessage(error));
  } finally {
    if (runtime?.auth.currentUser) {
      await runtime.authModule.signOut(runtime.auth).catch(() => undefined);
    }
  }
}

// Defensa adicional para logout: no descarga Firebase si nunca se usó.
export async function clearFederatedClientSession(): Promise<void> {
  if (!runtimePromise) return;
  const runtime = await runtimePromise.catch(() => null);
  if (runtime?.auth.currentUser) await runtime.authModule.signOut(runtime.auth);
}
