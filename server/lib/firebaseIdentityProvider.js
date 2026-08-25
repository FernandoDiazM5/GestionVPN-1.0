const { readFederatedAuthConfig } = require('./federatedAuthConfig');

const APP_NAME = 'gestionvpn-federated-auth';
let authClient = null;

function getAuthClient() {
  if (authClient) return authClient;
  const config = readFederatedAuthConfig();
  if (!config.enabled) throw new Error('Autenticación federada deshabilitada');

  const { applicationDefault, cert, getApps, initializeApp } = require('firebase-admin/app');
  const { getAuth } = require('firebase-admin/auth');
  let app = getApps().find(candidate => candidate.name === APP_NAME);
  if (!app) {
    const runtime = require('./platformIntegrationService').getRuntimeFirebase();
    app = initializeApp({ credential: runtime?.serviceAccount ? cert(runtime.serviceAccount) : applicationDefault(), projectId: config.projectId }, APP_NAME);
  }

  const baseAuth = getAuth(app);
  authClient = config.tenantId
    ? baseAuth.tenantManager().authForTenant(config.tenantId)
    : baseAuth;
  return authClient;
}

function normalizeClaims(claims, config, nowSeconds = Math.floor(Date.now() / 1000)) {
  const subject = typeof claims?.uid === 'string' ? claims.uid : claims?.sub;
  const email = typeof claims?.email === 'string' ? claims.email.trim().toLowerCase() : '';
  const authTime = Number(claims?.auth_time || 0);
  const signInProvider = typeof claims?.firebase?.sign_in_provider === 'string'
    ? claims.firebase.sign_in_provider
    : '';
  if (!subject || subject.length > 128 || !email || email.length > 255
      || claims?.email_verified !== true || !Number.isFinite(authTime) || authTime <= 0) {
    throw new Error('Identidad federada incompleta');
  }
  if (nowSeconds - authTime > config.maxAuthAgeSeconds || authTime > nowSeconds + 30) {
    throw new Error('Autenticación federada no reciente');
  }
  return Object.freeze({
    provider: config.provider,
    tenantKey: config.tenantKey,
    subject,
    email,
    emailVerified: true,
    authTime,
    signInProvider,
  });
}

async function verifyFirebaseIdToken(idToken, { requiredSignInProvider } = {}) {
  const config = readFederatedAuthConfig();
  if (!config.enabled) throw new Error('Autenticación federada deshabilitada');
  const claims = await getAuthClient().verifyIdToken(idToken, true);
  const identity = normalizeClaims(claims, config);
  if (requiredSignInProvider && identity.signInProvider !== requiredSignInProvider) {
    throw new Error('Proveedor de acceso no permitido');
  }
  return identity;
}

async function revokeFirebaseSessions(subject) {
  return getAuthClient().revokeRefreshTokens(subject);
}

async function getFirebaseUser(subject) {
  return getAuthClient().getUser(subject);
}

async function probeFirebaseAuthAccess() {
  try {
    await getAuthClient().getUser('__gestionvpn_preflight_nonexistent__');
  } catch (error) {
    if (error?.code !== 'auth/user-not-found') throw error;
  }
  return Object.freeze({ reachable: true });
}

function resetForTests() {
  authClient = null;
  try {
    const { deleteApp, getApps } = require('firebase-admin/app');
    const app = getApps().find(candidate => candidate.name === APP_NAME);
    if (app) void deleteApp(app).catch(() => {});
  } catch (_) { /* Firebase puede no estar cargado durante el arranque */ }
}

function setAuthClientForTests(client) {
  if (process.env.NODE_ENV !== 'test') throw new Error('Solo disponible en tests');
  authClient = client;
}

module.exports = {
  verifyFirebaseIdToken,
  revokeFirebaseSessions,
  getFirebaseUser,
  probeFirebaseAuthAccess,
  normalizeClaims,
  resetForTests,
  setAuthClientForTests,
};
