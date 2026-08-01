const crypto = require('crypto');
const net = require('node:net');
const observation = require('./webSecurityObservation');
const enforcementRepo = require('../db/repos/webSecurityEnforcementRepo');
const { callSecurityAgent } = require('./securityAgentClient');
const log = require('./logger').child({ scope: 'web-security-enforcement' });

const JAIL = 'gestionvpn-web-1h';
const INDEFINITE_JAIL = 'gestionvpn-indefinite';
const ACTIVE_ADMIN_TTL_MS = 30 * 60 * 1000;
const CONFIRMATION = 'ENABLE_TEMP_WEB_BANS';
const INDEFINITE_CONFIRMATION = 'ENABLE_INDEFINITE_WEB_BANS';
const RECIDIVE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const RECIDIVE_BANS = 3;
const WINDOW_MS = {
  INDEFINITE_AUTH_ABUSE: 24 * 60 * 60 * 1000,
  TEMP_1H_RATE_LIMIT: 10 * 60 * 1000,
  TEMP_1H_ROUTE_SCAN: 5 * 60 * 1000,
  TEMP_1H_SENSITIVE_SCAN: 10 * 60 * 1000,
};

function state() {
  const configuredMode = String(process.env.WEB_SECURITY_MODE || 'observe').toLowerCase();
  const confirmed = process.env.WEB_SECURITY_ENFORCEMENT_CONFIRM === CONFIRMATION;
  const active = configuredMode === 'enforce_temp' && confirmed;
  const indefiniteConfirmed = process.env.WEB_SECURITY_INDEFINITE_CONFIRM === INDEFINITE_CONFIRMATION;
  return { configuredMode, confirmed, active, indefiniteConfirmed,
    indefiniteActive: active && indefiniteConfirmed, jail: JAIL, indefiniteJail: INDEFINITE_JAIL,
    status: active ? 'TEMP_ENFORCEMENT' : 'OBSERVE_ONLY' };
}

function idempotencyKey(sourceIp, recommendation, jail, now) {
  const windowMs = WINDOW_MS[recommendation] || 60 * 60 * 1000;
  return crypto.createHash('sha256').update(`${sourceIp}\0${recommendation}\0${jail}\0${Math.floor(now / windowMs)}`).digest('hex');
}

async function touchAdminIp({ sourceIp, userId }) {
  if (!net.isIP(String(sourceIp || '')) || !userId) return false;
  await enforcementRepo.touchAdminIp({ sourceIp, userId });
  return true;
}

async function runOnce({ now = Date.now() } = {}) {
  const mode = state();
  if (!mode.active) return { ...mode, skipped: true, applied: 0, failed: 0 };
  const [snapshot, protectedIps] = await Promise.all([
    observation.observation({ now }),
    enforcementRepo.listActiveAdminIps(now - ACTIVE_ADMIN_TTL_MS),
  ]);
  if (snapshot.truncated) return { ...mode, skipped: true, reason: 'TRUNCATED_OBSERVATION',
    applied: 0, failed: 0 };
  const protectedSet = new Set(protectedIps);
  let applied = 0;
  let failed = 0;
  for (const source of snapshot.sources) {
    if (!net.isIP(source.sourceIp) || protectedSet.has(source.sourceIp)) continue;
    const recommendation = source.recommendations[0];
    if (!recommendation) continue;
    const directIndefinite = recommendation === 'INDEFINITE_AUTH_ABUSE';
    if (!directIndefinite && await enforcementRepo.hasActiveTemporary({
      sourceIp: source.sourceIp, jail: JAIL, now,
    })) continue;
    const priorTemporaryBans = await enforcementRepo.countAppliedSince({ sourceIp: source.sourceIp,
      jail: JAIL, since: now - RECIDIVE_WINDOW_MS });
    const recurrent = priorTemporaryBans >= RECIDIVE_BANS - 1;
    const applyIndefinite = mode.indefiniteActive && (directIndefinite || recurrent);
    const actionRecommendation = recurrent && !directIndefinite ? 'INDEFINITE_WEB_RECIDIVISM' : recommendation;
    const jail = applyIndefinite ? INDEFINITE_JAIL : JAIL;
    const id = await enforcementRepo.claim({
      idempotencyKey: idempotencyKey(source.sourceIp, actionRecommendation, jail, now),
      sourceIp: source.sourceIp, recommendation: actionRecommendation, jail, now,
    });
    if (!id) continue;
    try {
      const operation = applyIndefinite ? 'web_ban_indefinite' : 'web_ban';
      const result = await callSecurityAgent(operation, { target: source.sourceIp, jail,
        sourceJail: JAIL, protectedIps });
      await enforcementRepo.complete({ id, status: 'APPLIED', detail: result,
        expiresAt: applyIndefinite ? null : now + 60 * 60 * 1000, now });
      applied++;
    } catch (error) {
      await enforcementRepo.complete({ id, status: 'FAILED', detail: {
        code: error?.code || 'UNKNOWN', message: String(error?.message || '').slice(0, 300),
      }, now });
      failed++;
      log.warn({ target: source.sourceIp, recommendation: actionRecommendation, jail,
        code: error?.code }, 'Bloqueo web automático falló');
    }
  }
  await enforcementRepo.purgeAdminIps(now - 24 * 60 * 60 * 1000).catch(() => null);
  return { ...mode, skipped: false, applied, failed };
}

let timer = null;
let running = false;
async function tick() {
  if (running) return;
  running = true;
  try { await runOnce(); } catch (error) {
    log.error({ code: error?.code || 'UNKNOWN' }, 'Evaluación web temporal falló');
  } finally { running = false; }
}
function start() {
  if (timer) return;
  const intervalMs = Math.max(30_000, Number(process.env.WEB_SECURITY_ENFORCEMENT_INTERVAL_MS || 60_000));
  timer = setInterval(tick, intervalMs);
  timer.unref?.();
  log.info({ ...state(), intervalMs }, 'Protección web temporal inicializada');
}
function stop() { if (timer) clearInterval(timer); timer = null; }

module.exports = { idempotencyKey, runOnce, start, state, stop, touchAdminIp, JAIL, INDEFINITE_JAIL,
  ACTIVE_ADMIN_TTL_MS, CONFIRMATION, INDEFINITE_CONFIRMATION, RECIDIVE_WINDOW_MS, RECIDIVE_BANS };
