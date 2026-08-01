const net = require('node:net');
const eventRepo = require('../db/repos/webSecurityEventRepo');
const { bucketHash, clientIp } = require('./rateLimit');
const log = require('./logger').child({ scope: 'web-security-observation' });

const RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const MAX_ANALYSIS_EVENTS = 5000;
const SENSITIVE_PATH = /(?:^|\/)(?:\.env|\.git|wp-admin|wp-login\.php|phpmyadmin|adminer|server-status|actuator|vendor\/phpunit|cgi-bin|config(?:\.json|\.php)?|backup(?:\.zip|\.sql)?)(?:\/|$)/i;
const SENSITIVE_API_PATH = /^\/api\/(?:auth\/(?:login|password-reset(?:\/|$))|account\/(?:login|register|verify|resend|federated(?:\/|$))|team\/(?:accept|invitations(?:\/|$))|admin(?:\/|$))/i;
const EXPLICIT_AUTH_RECORDING_PATHS = new Set(['/api/auth/login', '/api/account/login']);
const AUTH_RATE_FLOWS = new Set(['LOGIN', 'FEDERATED_EXCHANGE', 'RESET_REQUEST', 'RESET_CONFIRM',
  'REGISTER', 'OTP_VERIFY', 'OTP_SEND', 'SECURITY_STEP_UP']);

function parseDetail(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return {}; }
}

function sensitiveClassification(path, statusCode) {
  if (/password-reset\/confirm/i.test(path)) return 'INVALID_RECOVERY_TOKEN';
  if (/account\/federated/i.test(path)) return 'INVALID_FEDERATED_TOKEN';
  if (/team\/(?:accept|invitations)/i.test(path)) return 'INVALID_INVITATION_OR_PERMISSION';
  if (/\/api\/admin/i.test(path)) return statusCode === 403
    ? 'INSUFFICIENT_ADMIN_PERMISSION' : 'NO_OR_INVALID_ADMIN_SESSION';
  if (/(?:register|verify|password-reset\/request)/i.test(path)) return 'INVALID_VERIFICATION_OR_FREQUENCY';
  return statusCode === 403 ? 'INSUFFICIENT_PERMISSION' : 'AUTHENTICATION_REJECTED';
}

function safeIp(value) {
  const ip = String(value || '').replace(/^::ffff:/, '').trim();
  return net.isIP(ip) ? ip : 'unknown';
}

function routeGroup(value) {
  return String(value || '').split('?')[0].slice(0, 160)
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ':uuid')
    .replace(/\b\d{3,}\b/g, ':n');
}

function identityHash(identity) {
  const normalized = String(identity || '').trim().toLowerCase();
  return normalized ? bucketHash('web-security-identity', normalized) : null;
}

function record(event) {
  return eventRepo.record({ ...event, sourceIp: safeIp(event.sourceIp),
    routeGroup: event.routeGroup ? routeGroup(event.routeGroup) : null })
    .catch((error) => log.warn({ code: error?.code }, 'No se pudo registrar evento web'));
}

function observeRequests(req, res, next) {
  if (req.path === '/metrics' || req.path.startsWith('/api/health')) return next();
  res.on('finish', () => {
    const path = routeGroup(req.originalUrl || req.url);
    const hostileSensitivePath = SENSITIVE_PATH.test(path);
    const sensitiveApi = SENSITIVE_API_PATH.test(path);
    let eventType = null;
    let detail = null;
    if (res.statusCode === 429) {
      eventType = 'RATE_LIMITED';
      detail = { classification: 'RATE_LIMIT_EXCEEDED', flow: req._authRateLimitFlow || null,
        dimension: req._authRateLimitDimension || null };
    } else if (hostileSensitivePath) {
      eventType = 'SENSITIVE_ENDPOINT';
      detail = { classification: 'SENSITIVE_PATH_REQUEST' };
    } else if (sensitiveApi && [400, 401, 403, 404, 410].includes(res.statusCode)
      && !EXPLICIT_AUTH_RECORDING_PATHS.has(path)) {
      eventType = 'SENSITIVE_ENDPOINT';
      detail = { classification: sensitiveClassification(path, res.statusCode) };
    } else if (res.statusCode === 404) {
      eventType = req.route ? 'RESOURCE_NOT_FOUND' : 'API_NOT_FOUND';
      detail = { classification: req.route ? 'KNOWN_ROUTE_MISSING_RESOURCE' : 'UNKNOWN_API_ROUTE' };
    } else if (res.statusCode === 401 && !EXPLICIT_AUTH_RECORDING_PATHS.has(path)) {
      eventType = 'UNAUTHENTICATED';
      detail = { classification: 'NO_OR_INVALID_SESSION' };
    } else if (res.statusCode === 403) {
      eventType = 'FORBIDDEN';
      detail = { classification: 'INSUFFICIENT_PERMISSION' };
    }
    if (!eventType || req._webSecurityRecorded) return;
    req._webSecurityRecorded = true;
    void record({ eventType, sourceIp: clientIp(req), routeGroup: path,
      userId: req.account?.sub || null, method: req.method, statusCode: res.statusCode, detail });
  });
  next();
}

function summarize(events, now = Date.now()) {
  const byIp = new Map();
  for (const event of events) {
    const ip = event.source_ip;
    if (!byIp.has(ip)) byIp.set(ip, { sourceIp: ip, authFailures24h: 0, identities24h: new Set(),
      unknownIdentities24h: 0, rateLimited10m: 0, notFound5m: 0, routes5m: new Set(),
      sensitive10m: 0, hostileSensitive10m: 0, sensitiveRoutes10m: new Set(),
      recoveryByUser: new Map(), authEvents: [],
      firstSeen: Number(event.occurred_at), lastSeen: Number(event.occurred_at), events: 0 });
    const row = byIp.get(ip);
    const at = Number(event.occurred_at);
    row.events++;
    row.firstSeen = Math.min(row.firstSeen, at);
    row.lastSeen = Math.max(row.lastSeen, at);
    if (event.event_type === 'AUTH_FAILURE' && at >= now - 24 * 60 * 60 * 1000) {
      row.authFailures24h++;
      if (event.identity_hash) row.identities24h.add(event.identity_hash);
      if (!event.user_id) row.unknownIdentities24h++;
      row.authEvents.push({ at, userId: event.user_id || null, detail: parseDetail(event.detail) });
    }
    if (event.event_type === 'ACCOUNT_RECOVERY' && event.user_id
      && at >= now - 24 * 60 * 60 * 1000) {
      row.recoveryByUser.set(event.user_id, Math.max(row.recoveryByUser.get(event.user_id) || 0, at));
    }
    if (event.event_type === 'RATE_LIMITED' && at >= now - 10 * 60 * 1000
      && AUTH_RATE_FLOWS.has(parseDetail(event.detail).flow)) row.rateLimited10m++;
    if (event.event_type === 'API_NOT_FOUND' && at >= now - 5 * 60 * 1000) {
      row.notFound5m++;
      if (event.route_group) row.routes5m.add(event.route_group);
    }
    if (event.event_type === 'SENSITIVE_ENDPOINT' && at >= now - 10 * 60 * 1000) {
      row.sensitive10m++;
      if (parseDetail(event.detail).classification === 'SENSITIVE_PATH_REQUEST') row.hostileSensitive10m++;
      if (event.route_group) row.sensitiveRoutes10m.add(event.route_group);
    }
  }
  return [...byIp.values()].map((row) => {
    const identityCount = row.identities24h.size;
    const recommendations = [];
    const distributedKnownAttack = row.authFailures24h >= 10 && identityCount >= 3;
    const unknownIdentityAttack = row.unknownIdentities24h >= 10;
    const relockedAfterRecovery = row.authEvents.some((failure) => failure.userId
      && failure.detail.reason === 'locked'
      && failure.at > (row.recoveryByUser.get(failure.userId) || Number.POSITIVE_INFINITY));
    const authInterpretation = relockedAfterRecovery ? 'RELOCKED_AFTER_RECOVERY'
      : unknownIdentityAttack ? 'AUTOMATED_UNKNOWN_IDENTITIES'
      : distributedKnownAttack ? 'MULTI_IDENTITY_BRUTE_FORCE'
        : row.authFailures24h >= 10 && identityCount === 1 ? 'POSSIBLE_FORGOTTEN_PASSWORD' : 'INSUFFICIENT_EVIDENCE';
    if (relockedAfterRecovery) recommendations.push('INDEFINITE_POST_UNLOCK_ATTACK');
    else if (distributedKnownAttack || unknownIdentityAttack) recommendations.push('INDEFINITE_AUTH_ABUSE');
    if (row.rateLimited10m >= 20) recommendations.push('TEMP_1H_RATE_LIMIT');
    if (row.notFound5m >= 30 && row.routes5m.size >= 10) recommendations.push('ROUTE_SCAN_DETECTED');
    if (row.hostileSensitive10m >= 3
      || (row.sensitive10m >= 10 && row.sensitiveRoutes10m.size >= 2)) {
      recommendations.push('TEMP_1H_SENSITIVE_SCAN');
    }
    return { sourceIp: row.sourceIp, authFailures24h: row.authFailures24h,
      identities24h: identityCount, unknownIdentities24h: row.unknownIdentities24h,
      authInterpretation,
      rateLimited10m: row.rateLimited10m, notFound5m: row.notFound5m,
      distinctRoutes5m: row.routes5m.size, sensitive10m: row.sensitive10m,
      hostileSensitive10m: row.hostileSensitive10m,
      distinctSensitiveRoutes10m: row.sensitiveRoutes10m.size,
      firstSeen: row.firstSeen, lastSeen: row.lastSeen, events: row.events,
      recommendations };
  }).sort((a, b) => b.recommendations.length - a.recommendations.length || b.lastSeen - a.lastSeen);
}

async function observation({ sourceIp = null, now = Date.now() } = {}) {
  const events = await eventRepo.listRecent({ since: now - 24 * 60 * 60 * 1000,
    sourceIp, limit: MAX_ANALYSIS_EVENTS });
  return { mode: 'OBSERVE_ONLY', retentionDays: 90, since: now - 24 * 60 * 60 * 1000,
    until: now, truncated: events.length >= MAX_ANALYSIS_EVENTS, sources: summarize(events, now),
    events: events.slice(0, 250).map((event) => ({ eventType: event.event_type,
      sourceIp: event.source_ip, userId: event.user_id || null, routeGroup: event.route_group,
      method: event.method, statusCode: event.status_code, occurredAt: Number(event.occurred_at),
      decision: event.decision || 'OBSERVE_ONLY', actionId: event.action_id || null,
      decidedAt: event.decided_at ? Number(event.decided_at) : null,
      detail: typeof event.detail === 'string' ? JSON.parse(event.detail) : event.detail })) };
}

let cleanupTimer = null;
function startCleanup() {
  if (cleanupTimer) return;
  const purge = () => eventRepo.purgeOlderThan(Date.now() - RETENTION_MS)
    .catch((error) => log.warn({ code: error?.code }, 'No se pudo aplicar retención web'));
  purge();
  cleanupTimer = setInterval(purge, 60 * 60 * 1000);
  cleanupTimer.unref?.();
}
function stopCleanup() { if (cleanupTimer) clearInterval(cleanupTimer); cleanupTimer = null; }

module.exports = { identityHash, observeRequests, observation, record, routeGroup, safeIp,
  summarize, startCleanup, stopCleanup, SENSITIVE_PATH, SENSITIVE_API_PATH, AUTH_RATE_FLOWS,
  sensitiveClassification, RETENTION_MS };
