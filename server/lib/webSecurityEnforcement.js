const crypto = require('crypto');
const net = require('node:net');
const observation = require('./webSecurityObservation');
const enforcementRepo = require('../db/repos/webSecurityEnforcementRepo');
const eventRepo = require('../db/repos/webSecurityEventRepo');
const { callSecurityAgent } = require('./securityAgentClient');
const notifier = require('./webSecurityNotifier');
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
const EVENT_TYPE = {
  INDEFINITE_AUTH_ABUSE: 'AUTH_FAILURE',
  TEMP_1H_RATE_LIMIT: 'RATE_LIMITED',
  TEMP_1H_ROUTE_SCAN: 'API_NOT_FOUND',
  TEMP_1H_SENSITIVE_SCAN: 'SENSITIVE_ENDPOINT',
};

function evidenceSummary(source) {
  return { authFailures24h: source.authFailures24h, identities24h: source.identities24h,
    unknownIdentities24h: source.unknownIdentities24h, rateLimited10m: source.rateLimited10m,
    notFound5m: source.notFound5m, distinctRoutes5m: source.distinctRoutes5m,
    sensitive10m: source.sensitive10m, firstSeen: source.firstSeen, lastSeen: source.lastSeen };
}

async function markEvidenceDecision({ sourceIp, recommendation, decision, actionId, now }) {
  const eventType = EVENT_TYPE[recommendation];
  if (!eventType) return;
  await eventRepo.markDecision({ sourceIp, eventType, since: now - WINDOW_MS[recommendation],
    decision, actionId, decidedAt: now });
}

function state() {
  const configuredMode = String(process.env.WEB_SECURITY_MODE || 'observe').toLowerCase();
  const confirmed = process.env.WEB_SECURITY_ENFORCEMENT_CONFIRM === CONFIRMATION;
  const armed = configuredMode === 'enforce_temp' && confirmed;
  const requestedRollout = Number(process.env.WEB_SECURITY_ROLLOUT_PERCENT || 0);
  const rolloutPercent = Number.isInteger(requestedRollout) && requestedRollout >= 0
    && requestedRollout <= 100 ? requestedRollout : 0;
  const active = armed && rolloutPercent > 0;
  const indefiniteConfirmed = process.env.WEB_SECURITY_INDEFINITE_CONFIRM === INDEFINITE_CONFIRMATION;
  return { configuredMode, confirmed, armed, active, rolloutPercent, indefiniteConfirmed,
    indefiniteActive: active && indefiniteConfirmed, jail: JAIL, indefiniteJail: INDEFINITE_JAIL,
    status: active ? 'TEMP_ENFORCEMENT' : armed ? 'ARMED_NO_ROLLOUT' : 'OBSERVE_ONLY' };
}

function rolloutBucket(sourceIp) {
  return (crypto.createHash('sha256').update(`web-security-rollout\0${sourceIp}`).digest().readUInt32BE(0) % 100) + 1;
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
    if (rolloutBucket(source.sourceIp) > mode.rolloutPercent) continue;
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
      sourceIp: source.sourceIp, recommendation: actionRecommendation, jail,
      evidence: evidenceSummary(source), now,
    });
    if (!id) continue;
    try {
      const operation = applyIndefinite ? 'web_ban_indefinite' : 'web_ban';
      const result = await callSecurityAgent(operation, { target: source.sourceIp, jail,
        sourceJail: JAIL, protectedIps });
      await enforcementRepo.complete({ id, status: 'APPLIED', detail: result,
        expiresAt: applyIndefinite ? null : now + 60 * 60 * 1000, now });
      await markEvidenceDecision({ sourceIp: source.sourceIp, recommendation,
        decision: applyIndefinite ? 'INDEFINITE_BAN_APPLIED' : 'TEMPORARY_BAN_APPLIED',
        actionId: id, now }).catch((error) => log.warn({ code: error?.code },
        'No se pudo vincular evidencia web aplicada'));
      await notifier.notifyAutomaticAction({ status: 'APPLIED', sourceIp: source.sourceIp,
        recommendation: actionRecommendation, jail, detail: result });
      applied++;
    } catch (error) {
      const failure = {
        code: error?.code || 'UNKNOWN', message: String(error?.message || '').slice(0, 300),
      };
      await enforcementRepo.complete({ id, status: 'FAILED', detail: failure, now });
      await markEvidenceDecision({ sourceIp: source.sourceIp, recommendation,
        decision: 'AUTOMATIC_ACTION_FAILED', actionId: id, now }).catch((markError) =>
        log.warn({ code: markError?.code }, 'No se pudo vincular evidencia web fallida'));
      await notifier.notifyAutomaticAction({ status: 'FAILED', sourceIp: source.sourceIp,
        recommendation: actionRecommendation, jail, detail: failure });
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
  ACTIVE_ADMIN_TTL_MS, CONFIRMATION, INDEFINITE_CONFIRMATION, RECIDIVE_WINDOW_MS, RECIDIVE_BANS,
  rolloutBucket, evidenceSummary };
