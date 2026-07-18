const { signSession, verifySession } = require('./jwt');
const authSessionRepo = require('../db/repos/authSessionRepo');

const CLAIM_KEYS = ['sub', 'email', 'workspace_id', 'role', 'platform_admin'];

function identityFrom(account, overrides = {}) {
  const identity = {};
  for (const key of CLAIM_KEYS) {
    if (account?.[key] !== undefined) identity[key] = account[key];
  }
  return { ...identity, ...overrides };
}

function build(identity) {
  const token = signSession(identity);
  const claims = verifySession(token);
  return { token, claims, expiresAt: Number(claims.exp) * 1000 };
}

async function issueSession(identity) {
  const session = build(identity);
  await authSessionRepo.create({
    jti: session.claims.jti,
    userId: session.claims.sub,
    expiresAt: session.expiresAt,
  });
  return session;
}

async function rotateSession(account, overrides = {}) {
  const session = build(identityFrom(account, overrides));
  await authSessionRepo.rotate({
    previousJti: account.jti,
    jti: session.claims.jti,
    userId: account.sub,
    expiresAt: session.expiresAt,
  });
  return session;
}

async function replaceAllSessions(account, overrides = {}) {
  const session = build(identityFrom(account, overrides));
  await authSessionRepo.replaceAll({
    jti: session.claims.jti,
    userId: account.sub,
    expiresAt: session.expiresAt,
  });
  return session;
}

module.exports = {
  identityFrom,
  issueSession,
  rotateSession,
  replaceAllSessions,
  revokeSession: authSessionRepo.revoke,
  revokeAllSessions: authSessionRepo.revokeAll,
};
