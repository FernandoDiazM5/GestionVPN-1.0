const express = require('express');
const { z } = require('zod');
const { asyncHandler, AppError, sendOk } = require('../lib/apiResponse');
const { inspectCore, previewProvision, provisionCore } = require('../lib/coreServerService');
const { getLastBackup, loadConfig, runCoreBackup } = require('../lib/coreBackupService');
const coreProvisionRepo = require('../db/repos/coreProvisionRepo');
const { getAppSetting } = require('../db.service');
const { inspectVpsWireguard } = require('../lib/vpsWireguardStatus');
const { previewVpsWireguard } = require('../lib/vpsWireguardPreview');
const { requestWireguardOperation, readWireguardAgentResult } = require('../lib/vpsWireguardIntent');
const { previewCoreVpsPeer, syncCoreVpsPeer } = require('../lib/coreVpsPeerService');
const { previewCoreFirewallLockdown, applyCoreFirewallLockdown } = require('../lib/coreFirewallLockdownService');
const crypto = require('node:crypto');

const router = express.Router();
const CONFIRMATION = 'PREPARAR DESDE CERO';
const WG_APPLY_CONFIRMATION = 'APLICAR WIREGUARD VPS';
const WG_ROLLBACK_CONFIRMATION = 'REVERTIR WIREGUARD VPS';
const WG_CORE_CONFIRMATION = 'SINCRONIZAR PEER VPS';
const WG_ROTATE_CONFIRMATION = 'ROTAR CLAVE WIREGUARD VPS';
const CORE_LOCKDOWN_CONFIRMATION = 'CERRAR ACCESO PUBLICO DEL CORE';
const localNetworksSchema = z.array(z.string().trim().min(9).max(18)).min(1).max(32);
const wireguardPreviewSchema = z.object({
  interface: z.string().trim().regex(/^[A-Za-z0-9_.-]{1,15}$/, 'Interfaz WireGuard inválida.'),
  address: z.string().trim().min(9).max(18),
  localListenPort: z.number().int().min(0).max(65535),
  mtu: z.number().int().min(1280).max(1500),
  corePublicKey: z.string().trim().regex(/^[A-Za-z0-9+/]{43}=$/, 'Clave pública del Core inválida.'),
  coreEndpointHost: z.string().trim().min(1).max(253).regex(/^[A-Za-z0-9.-]+$/, 'Endpoint del Core inválido.'),
  coreEndpointPort: z.number().int().min(1).max(65535),
  allowedIps: z.array(z.string().trim().min(3).max(18)).min(1).max(64),
  persistentKeepalive: z.number().int().min(0).max(3600),
}).strict();

function asAppError(error) {
  const map = {
    CORE_PROVISION_BLOCKED: [409, 'CORE_PROVISION_BLOCKED'],
    BACKUP_IN_PROGRESS: [409, 'BACKUP_IN_PROGRESS'],
    CORE_NOT_CONFIGURED: [400, 'CORE_NOT_CONFIGURED'],
    BACKUP_PASSWORD_REQUIRED: [400, 'BACKUP_PASSWORD_REQUIRED'],
    ADMIN_EMAIL_REQUIRED: [400, 'ADMIN_EMAIL_REQUIRED'],
    BACKUP_EMAIL_FAILED: [503, 'BACKUP_EMAIL_FAILED'],
    CORE_LOCKDOWN_BLOCKED: [409, 'CORE_LOCKDOWN_BLOCKED'],
    CORE_TUNNEL_UNREACHABLE: [503, 'CORE_TUNNEL_UNREACHABLE'],
    CORE_LOCKDOWN_VERIFY_FAILED: [503, 'CORE_LOCKDOWN_VERIFY_FAILED'],
  };
  const [status, code] = map[error?.code] || [502, error?.code || 'CORE_OPERATION_FAILED'];
  return new AppError(error?.message || 'No se pudo completar la operación sobre el servidor VPN.', status, code, error?.preview ? { preview: error.preview } : null);
}

router.get('/status', asyncHandler(async (_req, res) => {
  const [health, lastBackup, config, inspectedWireguard, wireguardAgent, desiredRaw, firewallLockedAt] = await Promise.all([
    inspectCore(), getLastBackup(), loadConfig(), inspectVpsWireguard(), readWireguardAgentResult(),
    getAppSetting('vps_wireguard_desired').catch(() => ''), getAppSetting('core_firewall_locked_at').catch(() => ''),
  ]);
  const vpsWireguard = {
    ...inspectedWireguard,
    publicKey: inspectedWireguard.publicKey || wireguardAgent?.publicKey || null,
  };
  if (vpsWireguard.interfacePresent && vpsWireguard.publicKey && vpsWireguard.addresses.length > 0) {
    vpsWireguard.status = 'ACTIVE';
  }
  let wireguardDesired = null;
  try { wireguardDesired = wireguardPreviewSchema.parse(JSON.parse(desiredRaw || '{}')); } catch (_) { /* sin configuración guardada */ }
  return sendOk(res, {
    health,
    vpsWireguard,
    wireguardAgent,
    wireguardDesired,
    coreFirewallLockedAt: Number(firewallLockedAt || 0) || null,
    backup: {
      enabled: config.enabled,
      time: config.time,
      timeZone: config.timeZone,
      passwordConfigured: config.backupPassword.length >= 12,
      last: lastBackup,
    },
  });
}));

router.post('/health', asyncHandler(async (_req, res) => sendOk(res, { health: await inspectCore() })));

router.post('/wireguard-preview', asyncHandler(async (req, res) => {
  const input = wireguardPreviewSchema.parse(req.body);
  const [managementSupernet, current] = await Promise.all([
    getAppSetting('management_supernet').catch(() => ''),
    inspectVpsWireguard(),
  ]);
  return sendOk(res, { preview: previewVpsWireguard(input, { managementSupernet, current }) });
}));

router.get('/wireguard-history', asyncHandler(async (_req, res) => {
  const db = await require('../db.service').getDb();
  const rows = await db.all(`SELECT a.id,a.action,a.outcome,a.reason,a.detail,a.created_at,u.email AS actor_email
    FROM platform_security_audit a
    LEFT JOIN users u ON u.id=a.actor_user_id
    WHERE a.action LIKE 'WG\\_%'
    ORDER BY a.created_at DESC LIMIT 30`);
  const events = rows.map((row) => {
    let detail = {};
    try { detail = JSON.parse(row.detail || '{}'); } catch (_) { /* detalle histórico no JSON */ }
    return { id: row.id, action: row.action, outcome: row.outcome, reason: row.reason,
      actorEmail: row.actor_email || null, createdAt: Number(row.created_at), detail };
  });
  return sendOk(res, { events });
}));

async function recordWireguardAudit(req, action, outcome, detail) {
  const db = await require('../db.service').getDb();
  await db.run(`INSERT INTO platform_security_audit
    (id,actor_user_id,action,target,jail,category,reason,outcome,detail,request_ip,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`, [
    crypto.randomUUID(), req.account?.sub, action, 'wg0', null, 'NETWORK_CONFIG',
    'Configuración WireGuard desde Administración', outcome, JSON.stringify(detail || {}), req.ip || null, Date.now(),
  ]);
}

router.post('/wireguard-apply', asyncHandler(async (req, res) => {
  const body = wireguardPreviewSchema.extend({ confirmation: z.literal(WG_APPLY_CONFIRMATION) }).parse(req.body);
  const { confirmation: _confirmation, ...input } = body;
  const [managementSupernet, current] = await Promise.all([
    getAppSetting('management_supernet').catch(() => ''), inspectVpsWireguard(),
  ]);
  const preview = previewVpsWireguard(input, { managementSupernet, current });
  if (!preview.valid) throw new AppError(preview.blockers[0], 409, 'WG_PREVIEW_BLOCKED', { preview });
  const db = await require('../db.service').getDb();
  await db.run(
    'INSERT INTO app_settings (`key`, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(`key`) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
    ['vps_wireguard_desired', JSON.stringify(input), Date.now()],
  );
  const request = await requestWireguardOperation('APPLY', input, req.account?.sub);
  await recordWireguardAudit(req, 'WG_VPS_APPLY_REQUESTED', 'SUCCESS', { requestId: request.requestId, desired: preview.desired });
  return sendOk(res, { request, confirmation: WG_APPLY_CONFIRMATION }, 202);
}));

router.post('/wireguard-rollback', asyncHandler(async (req, res) => {
  z.object({ confirmation: z.literal(WG_ROLLBACK_CONFIRMATION) }).strict().parse(req.body);
  const request = await requestWireguardOperation('ROLLBACK', null, req.account?.sub);
  await recordWireguardAudit(req, 'WG_VPS_ROLLBACK_REQUESTED', 'SUCCESS', { requestId: request.requestId });
  return sendOk(res, { request, confirmation: WG_ROLLBACK_CONFIRMATION }, 202);
}));

router.post('/wireguard-rotate', asyncHandler(async (req, res) => {
  z.object({ confirmation: z.literal(WG_ROTATE_CONFIRMATION) }).strict().parse(req.body);
  const raw = await getAppSetting('vps_wireguard_desired').catch(() => '');
  let desired;
  try { desired = wireguardPreviewSchema.parse(JSON.parse(raw || '{}')); }
  catch (_) { throw new AppError('Primero guarda y aplica una configuración WireGuard válida.', 409, 'WG_DESIRED_MISSING'); }
  const request = await requestWireguardOperation('ROTATE', desired, req.account?.sub);
  await recordWireguardAudit(req, 'WG_VPS_KEY_ROTATION_REQUESTED', 'SUCCESS', { requestId: request.requestId });
  return sendOk(res, { request, confirmation: WG_ROTATE_CONFIRMATION }, 202);
}));

router.get('/wireguard-core-preview', asyncHandler(async (_req, res) => {
  const [current, agent] = await Promise.all([inspectVpsWireguard(), readWireguardAgentResult()]);
  const vpsPublicKey = current.publicKey || agent?.publicKey || null;
  try {
    return sendOk(res, { preview: await previewCoreVpsPeer({ vpsPublicKey }), confirmation: WG_CORE_CONFIRMATION });
  } catch (error) { throw asAppError(error); }
}));

router.post('/wireguard-core-sync', asyncHandler(async (req, res) => {
  z.object({ confirmation: z.literal(WG_CORE_CONFIRMATION) }).strict().parse(req.body);
  const [current, agent] = await Promise.all([inspectVpsWireguard(), readWireguardAgentResult()]);
  const vpsPublicKey = current.publicKey || agent?.publicKey || null;
  if (!vpsPublicKey) throw new AppError('WireGuard del VPS aún no tiene una clave pública activa.', 409, 'WG_VPS_NOT_ACTIVE');
  try {
    const result = await syncCoreVpsPeer(vpsPublicKey);
    await recordWireguardAudit(req, 'WG_CORE_VPS_PEER_SYNCED', 'SUCCESS', result);
    return sendOk(res, { result });
  } catch (error) { throw asAppError(error); }
}));

router.post('/firewall-lockdown-preview', asyncHandler(async (req, res) => {
  const { localNetworks } = z.object({ localNetworks: localNetworksSchema }).strict().parse(req.body);
  try {
    return sendOk(res, { preview: await previewCoreFirewallLockdown(localNetworks), confirmation: CORE_LOCKDOWN_CONFIRMATION });
  } catch (error) { throw asAppError(error); }
}));

router.post('/firewall-lockdown', asyncHandler(async (req, res) => {
  const { localNetworks } = z.object({
    localNetworks: localNetworksSchema,
    confirmation: z.literal(CORE_LOCKDOWN_CONFIRMATION),
  }).strict().parse(req.body);
  try {
    const result = await applyCoreFirewallLockdown(localNetworks);
    await recordWireguardAudit(req, 'WG_CORE_FIREWALL_LOCKED', 'SUCCESS', result);
    return sendOk(res, { result });
  } catch (error) { throw asAppError(error); }
}));

router.get('/provision-preview', asyncHandler(async (_req, res) => {
  try {
    return sendOk(res, { preview: await previewProvision(), confirmation: CONFIRMATION });
  } catch (error) {
    throw asAppError(error);
  }
}));

router.get('/provision-history', asyncHandler(async (_req, res) => {
  return sendOk(res, { runs: await coreProvisionRepo.history(20) });
}));

router.post('/provision', asyncHandler(async (req, res) => {
  const body = z.object({ confirmation: z.literal(CONFIRMATION) }).parse(req.body);
  if (body.confirmation !== CONFIRMATION) throw new AppError('Confirmación inválida.', 422, 'INVALID_CONFIRMATION');
  const preview = await previewProvision();
  const runId = await coreProvisionRepo.start({
    actorUserId: req.account?.sub,
    targetHost: preview.summary?.host || await getAppSetting('MT_IP'),
    targetIdentity: preview.summary?.identity,
    targetVersion: preview.summary?.version,
    targetModel: preview.summary?.model,
    networkSupernet: await getAppSetting('management_supernet'),
  });
  if (!preview.canProvision) {
    await coreProvisionRepo.finish(runId, { status: 'BLOCKED', steps: [], errorCode: 'CORE_PROVISION_BLOCKED', errorMessage: preview.blockers.join(' ') });
    throw asAppError(Object.assign(new Error(preview.blockers.join(' ')), { code: 'CORE_PROVISION_BLOCKED', preview }));
  }
  try {
    const result = await provisionCore();
    await coreProvisionRepo.finish(runId, { status: 'COMPLETED', steps: result.steps, identity: result.health?.identity });
    return sendOk(res, { result: { ...result, runId } });
  } catch (error) {
    await coreProvisionRepo.finish(runId, { status: 'FAILED', steps: error.steps || [], errorCode: error.code || 'CORE_OPERATION_FAILED', errorMessage: error.message });
    throw asAppError(error);
  }
}));

router.post('/backup-now', asyncHandler(async (_req, res) => {
  try {
    return sendOk(res, { result: await runCoreBackup('manual') });
  } catch (error) {
    throw asAppError(error);
  }
}));

module.exports = router;
