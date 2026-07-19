const path = require('node:path');
process.env.DOTENV_CONFIG_QUIET ||= 'true';

try {
  require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env') });
  require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
} catch (_) { /* opcional */ }

const { query, closePool } = require('../db/mysql');
const authIdentityRepo = require('../db/repos/authIdentityRepo');
const authSessionRepo = require('../db/repos/authSessionRepo');
const { readFederatedAuthConfig } = require('../lib/federatedAuthConfig');
const {
  getFirebaseUser,
  revokeFirebaseSessions,
} = require('../lib/firebaseIdentityProvider');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UID_RE = /^[A-Za-z0-9._-]{1,128}$/;
const CONFIRM_LINK = 'LINK_FIREBASE_CANARY';
const CONFIRM_DISABLE = 'DISABLE_FIREBASE_CANARY';

function valueAfter(argv, name) {
  const index = argv.indexOf(name);
  if (index < 0) return null;
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requiere un valor`);
  return value;
}

function parseArgs(argv) {
  const command = argv[0];
  if (!['status', 'link', 'disable'].includes(command)) {
    throw new Error(
      'Uso: firebase:canary -- <status|link|disable> --email <correo> '
      + '[--uid <uid>] [--apply --confirm <frase>]',
    );
  }

  const email = String(valueAfter(argv, '--email') || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 255) throw new Error('--email inválido');
  const uid = valueAfter(argv, '--uid');
  if (command === 'link' && (!uid || !UID_RE.test(uid))) throw new Error('--uid inválido');
  if (uid && !UID_RE.test(uid)) throw new Error('--uid inválido');

  const apply = argv.includes('--apply');
  const confirm = valueAfter(argv, '--confirm');
  if (apply && command === 'link' && confirm !== CONFIRM_LINK) {
    throw new Error(`Para aplicar link usa --confirm ${CONFIRM_LINK}`);
  }
  if (apply && command === 'disable' && confirm !== CONFIRM_DISABLE) {
    throw new Error(`Para aplicar disable usa --confirm ${CONFIRM_DISABLE}`);
  }

  const knownFlags = new Set(['--email', '--uid', '--apply', '--confirm']);
  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    if (!knownFlags.has(token)) throw new Error(`Opción no soportada: ${token}`);
    if (token !== '--apply') index += 1;
  }
  return { command, email, uid, apply, confirm };
}

function mappingScope(env = process.env) {
  const provider = String(env.FEDERATED_AUTH_PROVIDER || 'firebase').trim().toLowerCase();
  if (provider !== 'firebase') throw new Error('FEDERATED_AUTH_PROVIDER no soportado');
  const tenantKey = String(env.FIREBASE_TENANT_ID || '').trim();
  if (tenantKey && !UID_RE.test(tenantKey)) throw new Error('FIREBASE_TENANT_ID inválido');
  return { provider, tenantKey };
}

function redactEmail(email) {
  const [local, domain] = email.split('@');
  return `${local.slice(0, 1)}***@${domain}`;
}

async function findLocalUser(email, requireEligible) {
  const rows = await query(
    `SELECT u.id, u.email, u.email_verified, u.disabled_at, u.deleted_at, u.is_platform_admin,
            wm.workspace_id, wm.role, w.deleted_at AS workspace_deleted_at
       FROM users u
       JOIN workspace_members wm ON wm.user_id = u.id AND wm.deleted_at IS NULL
       JOIN workspaces w ON w.id = wm.workspace_id
      WHERE u.email = ?
      ORDER BY (wm.role = 'OWNER') DESC, wm.created_at ASC`,
    [email],
  );
  if (!rows.length) throw new Error('Usuario local no encontrado');
  const user = rows.find(row => row.role === 'OWNER') || rows[0];
  if (requireEligible && (
    user.role !== 'OWNER'
    || Number(user.is_platform_admin) === 1
    || Number(user.email_verified) !== 1
    || user.disabled_at
    || user.deleted_at
    || user.workspace_deleted_at
  )) {
    throw new Error('El canary debe ser un moderador OWNER activo y con correo verificado');
  }
  return user;
}

function requireStagingConfig() {
  if (process.env.FIREBASE_PILOT_ENV !== 'staging') {
    throw new Error('FIREBASE_PILOT_ENV debe ser staging');
  }
  const config = readFederatedAuthConfig();
  if (!config.enabled) throw new Error('FEDERATED_AUTH_ENABLED debe estar true en staging');
  return config;
}

async function showStatus(email) {
  const local = await findLocalUser(email, false);
  const mapping = await authIdentityRepo.findByUser({
    userId: local.id,
    ...mappingScope(),
  });
  console.log(`Canary ${redactEmail(local.email)} · rol=${local.role}`);
  if (!mapping) {
    console.log('Mapping Firebase: ausente');
    return { state: 'absent' };
  }
  const state = mapping.disabled_at ? 'disabled' : 'active';
  console.log(`Mapping Firebase: ${state} · tenant=${mapping.tenant_key ? 'configurado' : 'global'}`);
  return { state };
}

async function linkCanary(args) {
  const config = requireStagingConfig();
  const local = await findLocalUser(args.email, true);
  const firebaseUser = await getFirebaseUser(args.uid);
  const firebaseEmail = String(firebaseUser.email || '').trim().toLowerCase();
  if (firebaseEmail !== local.email || firebaseUser.emailVerified !== true
      || firebaseUser.disabled === true) {
    throw new Error('La identidad Firebase debe estar activa, verificada y usar exactamente el correo local');
  }

  const scope = { provider: config.provider, tenantKey: config.tenantKey };
  const [byUser, bySubject] = await Promise.all([
    authIdentityRepo.findByUser({ userId: local.id, ...scope }),
    authIdentityRepo.findBySubject({ subject: args.uid, ...scope }),
  ]);
  if (bySubject && bySubject.user_id !== local.id) {
    throw new Error('El UID Firebase ya está vinculado a otro usuario');
  }
  if (byUser && byUser.provider_subject !== args.uid) {
    throw new Error('El usuario local ya tiene otro UID Firebase');
  }

  const action = !byUser ? 'crear' : byUser.disabled_at ? 'reactivar' : 'sin-cambios';
  console.log(
    `Plan: ${action} mapping para ${redactEmail(local.email)} · `
    + `tenant=${config.tenantKey ? 'configurado' : 'global'}`,
  );
  if (!args.apply || action === 'sin-cambios') {
    console.log(args.apply ? 'El mapping ya estaba activo.' : '[DRY-RUN] No se escribió nada.');
    return { action, applied: false };
  }

  if (action === 'crear') {
    await authIdentityRepo.link({
      userId: local.id,
      provider: config.provider,
      tenantKey: config.tenantKey,
      subject: args.uid,
      emailAtLink: local.email,
    });
  } else {
    await authIdentityRepo.reactivate({ id: byUser.id, emailAtLink: local.email });
  }
  console.log('✓ Mapping canary aplicado. El login local permanece disponible.');
  return { action, applied: true };
}

async function disableCanary(args) {
  const config = requireStagingConfig();
  const local = await findLocalUser(args.email, false);
  const mapping = await authIdentityRepo.findByUser({
    userId: local.id,
    provider: config.provider,
    tenantKey: config.tenantKey,
  });
  if (!mapping) throw new Error('El usuario no tiene mapping Firebase en este tenant');

  console.log(
    `Plan: deshabilitar mapping de ${redactEmail(local.email)} y revocar `
    + 'sesiones locales/Firebase.',
  );
  if (!args.apply) {
    console.log('[DRY-RUN] No se escribió nada ni se revocaron sesiones.');
    return { applied: false };
  }

  if (!mapping.disabled_at) {
    const disabled = await authIdentityRepo.setDisabled({ id: mapping.id, disabledAt: Date.now() });
    if (!disabled) throw new Error('No se pudo deshabilitar el mapping local');
  }
  await authSessionRepo.revokeAll(local.id);
  try {
    await revokeFirebaseSessions(mapping.provider_subject);
  } catch (error) {
    console.error('El mapping local quedó deshabilitado, pero falló la revocación Firebase.');
    throw error;
  }
  console.log('✓ Mapping deshabilitado; sesiones locales y refresh tokens Firebase revocados.');
  return { applied: true };
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.command === 'status') await showStatus(args.email);
  if (args.command === 'link') await linkCanary(args);
  if (args.command === 'disable') await disableCanary(args);
  return 0;
}

if (require.main === module) {
  main()
    .then(code => { process.exitCode = code; })
    .catch(error => {
      console.error('[firebase:canary] Error:', error.code || error.message);
      process.exitCode = 1;
    })
    .finally(() => closePool().catch(() => undefined));
}

module.exports = {
  CONFIRM_LINK,
  CONFIRM_DISABLE,
  parseArgs,
  mappingScope,
  redactEmail,
  findLocalUser,
  requireStagingConfig,
  showStatus,
  linkCanary,
  disableCanary,
  main,
};
