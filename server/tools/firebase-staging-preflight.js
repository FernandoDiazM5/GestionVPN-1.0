const path = require('node:path');
process.env.DOTENV_CONFIG_QUIET ||= 'true';

try {
  require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env') });
  require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
} catch (_) { /* opcional */ }

const { query, closePool } = require('../db/mysql');
const { readFederatedAuthConfig } = require('../lib/federatedAuthConfig');
const { probeFirebaseAuthAccess } = require('../lib/firebaseIdentityProvider');

const EXPECTED_COLUMNS = Object.freeze([
  'id', 'user_id', 'provider', 'tenant_key', 'provider_subject', 'email_at_link',
  'created_at', 'updated_at', 'last_verified_at', 'disabled_at',
]);

function parseOptions(argv) {
  const allowed = new Set(['--provider', '--json']);
  const unknown = argv.filter(value => !allowed.has(value));
  if (unknown.length) throw new Error(`Opciones no soportadas: ${unknown.join(', ')}`);
  return { provider: argv.includes('--provider'), json: argv.includes('--json') };
}

function staticChecks(env = process.env) {
  const pilotEnvironment = String(env.FIREBASE_PILOT_ENV || '');
  const supportedEnvironment = pilotEnvironment === 'staging' || pilotEnvironment === 'production';
  const checks = [
    {
      name: 'pilot_environment',
      ok: supportedEnvironment,
      detail: supportedEnvironment ? pilotEnvironment : 'debe ser staging o production',
    },
    {
      name: 'backend_feature_flag',
      ok: env.FEDERATED_AUTH_ENABLED === 'true',
      detail: env.FEDERATED_AUTH_ENABLED === 'true'
        ? `habilitada en ${pilotEnvironment || 'entorno no declarado'}`
        : 'apagada',
    },
    {
      name: 'node_runtime',
      ok: Number(process.versions.node.split('.')[0]) >= 22,
      detail: `Node ${process.versions.node}`,
    },
    {
      name: 'adc_source',
      ok: true,
      detail: env.GOOGLE_APPLICATION_CREDENTIALS
        ? 'archivo externo/ADC'
        : 'sin archivo declarado; validar ADC ambiental/WIF con --provider',
    },
  ];

  try {
    const config = readFederatedAuthConfig(env);
    checks.push({
      name: 'firebase_config',
      ok: config.enabled === true,
      detail: config.enabled
        ? `proyecto configurado; tenant=${config.tenantId ? 'si' : 'no'}`
        : 'deshabilitada',
    });
  } catch (error) {
    checks.push({ name: 'firebase_config', ok: false, detail: error.message });
  }
  return checks;
}

async function databaseChecks() {
  const columns = await query(
    `SELECT COLUMN_NAME
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'auth_identities'`,
  );
  const present = new Set(columns.map(row => row.COLUMN_NAME));
  const missing = EXPECTED_COLUMNS.filter(column => !present.has(column));
  const countRows = missing.length
    ? [{ total: 0, active: 0 }]
    : await query(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN disabled_at IS NULL THEN 1 ELSE 0 END) AS active
         FROM auth_identities`,
    );
  const counts = countRows[0] || { total: 0, active: 0 };
  return [
    {
      name: 'auth_identities_schema',
      ok: missing.length === 0,
      detail: missing.length ? `faltan: ${missing.join(', ')}` : 'completo',
    },
    {
      name: 'identity_mapping_inventory',
      ok: missing.length === 0,
      detail: `total=${Number(counts.total || 0)}; activos=${Number(counts.active || 0)}`,
    },
  ];
}

function printReport(report, json) {
  if (json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log('\nPreflight Firebase (solo lectura)');
  for (const check of report.checks) {
    const marker = check.status === 'skipped' ? '-' : check.ok ? 'OK' : 'FAIL';
    console.log(`[${marker}] ${check.name}: ${check.detail}`);
  }
  console.log(`\nResultado: ${report.ready ? 'LISTO' : 'BLOQUEADO'}`);
}

async function run(argv = process.argv.slice(2)) {
  const options = parseOptions(argv);
  const checks = staticChecks();
  try {
    try {
      checks.push(...await databaseChecks());
    } catch (error) {
      checks.push({
        name: 'database_access',
        ok: false,
        detail: error.code || error.message,
      });
    }
    if (options.provider) {
      try {
        const result = await probeFirebaseAuthAccess();
        checks.push({
          name: 'firebase_admin_access',
          ok: result.reachable === true,
          detail: 'ADC y API de Authentication accesibles',
        });
      } catch (error) {
        checks.push({
          name: 'firebase_admin_access',
          ok: false,
          detail: error.code || error.message,
        });
      }
    } else {
      checks.push({
        name: 'firebase_admin_access',
        status: 'skipped',
        ok: true,
        detail: 'usar --provider para comprobar ADC/API sin mostrar usuarios',
      });
    }
  } finally {
    await closePool();
  }

  const report = {
    ready: options.provider && checks.every(check => check.ok),
    providerChecked: options.provider,
    checks,
  };
  printReport(report, options.json);
  return report.ready ? 0 : 1;
}

if (require.main === module) {
  run().then(code => { process.exitCode = code; }).catch(error => {
    console.error('[firebase:preflight] Error:', error.code || error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  EXPECTED_COLUMNS,
  parseOptions,
  staticChecks,
  databaseChecks,
  printReport,
  run,
};
