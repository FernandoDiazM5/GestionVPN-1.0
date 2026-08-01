const net = require('node:net');
const eventRepo = require('../db/repos/webSecurityEventRepo');
const { bucketHash, clientIp } = require('./rateLimit');
const log = require('./logger').child({ scope: 'web-security-observation' });

const RETENTION_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_ANALYSIS_EVENTS = 5000;
const SENSITIVE_PATH = /(?:^|\/)(?:\.env|\.git|wp-admin|wp-login\.php|phpmyadmin|adminer|server-status|actuator|vendor\/phpunit|cgi-bin|config(?:\.json|\.php)?|backup(?:\.zip|\.sql)?)(?:\/|$)/i;

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
    const sensitive = SENSITIVE_PATH.test(path);
    let eventType = null;
    let detail = null;
    if (res.statusCode === 429) {
      eventType = 'RATE_LIMITED';
      detail = { flow: req._authRateLimitFlow || null, dimension: req._authRateLimitDimension || null };
    } else if (sensitive) {
      eventType = 'SENSITIVE_ENDPOINT';
    } else if (res.statusCode === 404 && !req.route) {
      eventType = 'API_NOT_FOUND';
    }
    if (!eventType || req._webSecurityRecorded) return;
    req._webSecurityRecorded = true;
    void record({ eventType, sourceIp: clientIp(req), routeGroup: path,
      method: req.method, statusCode: res.statusCode, detail });
  });
  next();
}

function summarize(events, now = Date.now()) {
  const byIp = new Map();
  for (const event of events) {
    const ip = event.source_ip;
    if (!byIp.has(ip)) byIp.set(ip, { sourceIp: ip, authFailures24h: 0, identities24h: new Set(),
      unknownIdentities24h: 0, rateLimited10m: 0, notFound5m: 0, routes5m: new Set(),
      sensitive10m: 0, firstSeen: Number(event.occurred_at), lastSeen: Number(event.occurred_at), events: 0 });
    const row = byIp.get(ip);
    const at = Number(event.occurred_at);
    row.events++;
    row.firstSeen = Math.min(row.firstSeen, at);
    row.lastSeen = Math.max(row.lastSeen, at);
    if (event.event_type === 'AUTH_FAILURE' && at >= now - 24 * 60 * 60 * 1000) {
      row.authFailures24h++;
      if (event.identity_hash) row.identities24h.add(event.identity_hash);
      if (!event.user_id) row.unknownIdentities24h++;
    }
    if (event.event_type === 'RATE_LIMITED' && at >= now - 10 * 60 * 1000) row.rateLimited10m++;
    if (event.event_type === 'API_NOT_FOUND' && at >= now - 5 * 60 * 1000) {
      row.notFound5m++;
      if (event.route_group) row.routes5m.add(event.route_group);
    }
    if (event.event_type === 'SENSITIVE_ENDPOINT' && at >= now - 10 * 60 * 1000) row.sensitive10m++;
  }
  return [...byIp.values()].map((row) => {
    const identityCount = row.identities24h.size;
    const recommendations = [];
    if (row.authFailures24h >= 10 && (identityCount >= 3 || row.unknownIdentities24h > 0)) recommendations.push('INDEFINITE_AUTH_ABUSE');
    if (row.rateLimited10m >= 20) recommendations.push('TEMP_1H_RATE_LIMIT');
    if (row.notFound5m >= 30 && row.routes5m.size >= 10) recommendations.push('TEMP_1H_ROUTE_SCAN');
    if (row.sensitive10m >= 3) recommendations.push('TEMP_1H_SENSITIVE_SCAN');
    return { sourceIp: row.sourceIp, authFailures24h: row.authFailures24h,
      identities24h: identityCount, unknownIdentities24h: row.unknownIdentities24h,
      rateLimited10m: row.rateLimited10m, notFound5m: row.notFound5m,
      distinctRoutes5m: row.routes5m.size, sensitive10m: row.sensitive10m,
      firstSeen: row.firstSeen, lastSeen: row.lastSeen, events: row.events,
      recommendations };
  }).sort((a, b) => b.recommendations.length - a.recommendations.length || b.lastSeen - a.lastSeen);
}

async function observation({ sourceIp = null, now = Date.now() } = {}) {
  const events = await eventRepo.listRecent({ since: now - 24 * 60 * 60 * 1000,
    sourceIp, limit: MAX_ANALYSIS_EVENTS });
  return { mode: 'OBSERVE_ONLY', retentionDays: 14, since: now - 24 * 60 * 60 * 1000,
    until: now, truncated: events.length >= MAX_ANALYSIS_EVENTS, sources: summarize(events, now),
    events: events.slice(0, 250).map((event) => ({ eventType: event.event_type,
      sourceIp: event.source_ip, userId: event.user_id || null, routeGroup: event.route_group,
      method: event.method, statusCode: event.status_code, occurredAt: Number(event.occurred_at),
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
  summarize, startCleanup, stopCleanup, SENSITIVE_PATH };
