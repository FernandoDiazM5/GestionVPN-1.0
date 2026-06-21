// ============================================================
//  routes/core/tunnel.routes.js — túnel multi-usuario por IP
//
//   POST /tunnel/activate         → abre acceso al VRF (mangle por IP)
//   POST /tunnel/deactivate       → cierra SOLO la sesión del usuario
//   POST /tunnel/keepalive        → recrea mangle si falta + renueva TTL
//   GET  /tunnel/events           → SSE de eventos del propio usuario
//   GET  /tunnel/status           → estado actual del túnel del usuario
//   GET  /tunnel/my-mgmt-ip       → IP de gestión registrada
//   POST /tunnel/register-my-ip   → declara mi IP (server-side valida peer)
//
//  ★ Aislamiento: la IP de gestión SIEMPRE se resuelve server-side desde
//    user_mgmt_ips. NUNCA se acepta del body — anti-spoofing.
// ============================================================

const express = require('express');
const router = express.Router();

const log = require('../../lib/logger').child({ scope: 'core:tunnel' });
const { connectToMikrotik, safeWrite } = require('../../routeros.service');
const { IPV4_REGEX } = require('../../ubiquiti.service');
const sessionRepo = require('../../db/repos/sessionRepo');
const mgmtIpRepo = require('../../db/repos/mgmtIpRepo');
const memberWgRepo = require('../../db/repos/memberWgRepo');
const { getDb } = require('../../db.service');
const provisioner = require('../../lib/tunnelProvisioner');
const tunnelService = require('../../lib/tunnelService');
const {
  addSseClient, removeSseClient, emitToUser, clientIpOf,
} = require('./_shared');
const { sendOk, AppError, asyncHandler } = require('../../lib/apiResponse');
const { mikrotikAppError } = require('../../lib/mikrotikError');
const { requireMikrotik } = require('../../lib/routeGuards');
const mgmtNet = require('../../lib/mgmtNet');

// ── POST /tunnel/activate — delega en lib/tunnelService (compartido con bot M1)
router.post('/tunnel/activate', asyncHandler(async (req, res) => {
  requireMikrotik(req);
  const result = await tunnelService.activateTunnel({
    account: req.account,
    targetVRF: req.body?.targetVRF,
    mikrotik: req.mikrotik,
    clientIp: clientIpOf(req),
  });
  if (!result.ok) {
    if (result.unreachable) throw new AppError(result.message, 503, 'MIKROTIK_UNREACHABLE', { unreachable: true });
    const code = result.code === 409 ? 'NO_MGMT_IP' : 'TUNNEL_ERROR';
    throw new AppError(result.message, result.code, code);
  }
  return sendOk(res, {
    message: `Acceso abierto a ${result.vrf}`,
    vrf: result.vrf,
    ipCliente: result.mgmtIp,
    sessionId: result.sessionId,
    tunnelExpiry: result.expiresAt,
  });
}));

// ── POST /tunnel/deactivate — delega en lib/tunnelService
router.post('/tunnel/deactivate', asyncHandler(async (req, res) => {
  requireMikrotik(req);
  const result = await tunnelService.deactivateTunnel({
    account: req.account,
    mikrotik: req.mikrotik,
    clientIp: clientIpOf(req),
  });
  if (!result.ok) throw new AppError(result.message, result.code, 'TUNNEL_ERROR');
  return sendOk(res, { message: 'Tu acceso fue revocado' });
}));

// ── POST /tunnel/keepalive — recrea la mangle DEL USUARIO si falta + renueva TTL ──
router.post('/tunnel/keepalive', asyncHandler(async (req, res) => {
  const { ip, user, pass } = requireMikrotik(req);
  const acc = req.account;
  if (!acc?.sub || !acc?.workspace_id) throw new AppError('Sesión inválida', 401, 'UNAUTHORIZED');

  let apiRead, apiWrite;
  try {
    const session = await sessionRepo.getActiveByUser(acc.workspace_id, acc.sub);
    if (!session) return sendOk(res, { restored: false, restoredItems: [], note: 'sin sesión activa' });

    const targetVRF = session.vrf_name;
    const mgmtIp = session.mgmt_ip;
    const restoredItems = [];

    // Lectura: ¿existe la mangle del usuario para su VRF?
    apiRead = await connectToMikrotik(ip, user, pass);
    const present = await provisioner.hasUserMangle(apiRead, { userId: acc.sub, mgmtIp, vrfName: targetVRF });
    await apiRead.close().catch(() => {});

    if (!present) {
      apiWrite = await connectToMikrotik(ip, user, pass);
      await provisioner.addUserMangle(apiWrite, { userId: acc.sub, mgmtIp, vrfName: targetVRF });
      await apiWrite.close().catch(() => {});
      restoredItems.push(`mangle ${provisioner.mangleComment(acc.sub)}`);
    }

    await sessionRepo.touch(session.id);   // renueva TTL
    const restored = restoredItems.length > 0;
    log.debug({ userId: acc.sub, vrf: targetVRF, restored }, 'KEEPALIVE');
    return sendOk(res, { restored, restoredItems });
  } catch (error) {
    if (apiRead) try { await apiRead.close(); } catch (_) { /* ignore */ }
    if (apiWrite) try { await apiWrite.close(); } catch (_) { /* ignore */ }
    if (error instanceof AppError) throw error;
    log.error({ err: error?.message }, 'KEEPALIVE Error');
    throw mikrotikAppError(error, ip, user);
  }
}));

// SSE: el cliente se suscribe y recibe SOLO los eventos de SU usuario.
router.get('/tunnel/events', (req, res) => {
  const userId = req.account?.sub;
  if (!userId) return res.status(401).end();
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  addSseClient(userId, res);
  // Heartbeat cada 25s para evitar que proxies cierren la conexión idle
  const heartbeat = setInterval(() => { try { res.write(': ping\n\n'); } catch (_) { /* noop */ } }, 25_000);
  req.on('close', () => { clearInterval(heartbeat); removeSseClient(userId, res); });
});

// Estado de túnel DEL USUARIO autenticado (no global).
router.get('/tunnel/status', asyncHandler(async (req, res) => {
  const acc = req.account;
  if (!acc?.sub || !acc?.workspace_id) return sendOk(res, { activeNodeVrf: null, tunnelExpiry: null });
  try {
    const session = await sessionRepo.getActiveByUser(acc.workspace_id, acc.sub);
    if (!session) return sendOk(res, { activeNodeVrf: null, tunnelExpiry: null });

    // Expiración perezosa: si venció, limpiar la mangle ANTES de cerrar en BD (C2).
    // Si la limpieza falla (router caído), se MANTIENE la sesión ACTIVE para que
    // un próximo poll reintente — así nunca queda mangle huérfana con acceso vivo.
    if (session.expires_at && Date.now() > session.expires_at) {
      if (req.mikrotik) {
        let a, b;
        try {
          const { ip, user, pass } = req.mikrotik;
          a = await connectToMikrotik(ip, user, pass);
          const ids = await provisioner.findUserMangleIds(a, acc.sub);  // lanza si print falla
          await a.close().catch(() => {});
          if (ids.length) {
            b = await connectToMikrotik(ip, user, pass);
            await provisioner.removeMangleIds(b, ids);               // lanza si algún remove falla
            await b.close().catch(() => {});
          }
        } catch (e) {
          if (a) try { await a.close(); } catch (_) { /* ignore */ }
          if (b) try { await b.close(); } catch (_) { /* ignore */ }
          // No se pudo revocar en el router → NO cerramos la sesión; se reintenta.
          log.warn({ err: e?.message }, 'TUNNEL-STATUS: limpieza falló al expirar, se mantiene ACTIVE');
          return sendOk(res, { activeNodeVrf: session.vrf_name, tunnelExpiry: session.expires_at });
        }
      }
      // Mangle eliminada (o sin router configurado) → ahora sí cerrar en BD.
      await sessionRepo.closeSession(session.id);
      await sessionRepo.log({ workspaceId: acc.workspace_id, sessionId: session.id, userId: acc.sub, tunnelId: session.tunnel_id, action: 'EXPIRE', statusCode: 200 });
      emitToUser(acc.sub, null, null);
      return sendOk(res, { activeNodeVrf: null, tunnelExpiry: null });
    }

    return sendOk(res, { activeNodeVrf: session.vrf_name, tunnelExpiry: session.expires_at });
  } catch (e) {
    log.warn({ err: e?.message }, 'TUNNEL-STATUS error');
    return sendOk(res, { activeNodeVrf: null, tunnelExpiry: null });
  }
}));

// ── GET /tunnel/my-mgmt-ip — ¿tengo IP de gestión registrada? ────────────────
router.get('/tunnel/my-mgmt-ip', asyncHandler(async (req, res) => {
  const acc = req.account;
  if (!acc?.sub || !acc?.workspace_id) throw new AppError('Sesión inválida', 401, 'UNAUTHORIZED');
  const ip = await mgmtIpRepo.getMgmtIpForUser(acc.workspace_id, acc.sub);
  return sendOk(res, { mgmtIp: ip });
}));

// ── POST /tunnel/register-my-ip — el usuario declara SU IP de gestión ─────────
//
//  Validación de ownership por rol (Q5 — antes solo verificaba existencia
//  del peer, dejando que un MEMBER reclamara IP de otro usuario):
//
//   • platform_admin → cualquier peer del router.
//   • OWNER (moderador) → el peer debe pertenecer al workspace del usuario
//     (mgmt_peer_owners.workspace_id === acc.workspace_id). El moderador
//     administra sus propios peers; aceptar cualquiera del workspace es ok.
//   • MEMBER → el peer.public-key DEBE coincidir con su member_wireguard
//     (que se crea solo cuando el OWNER lo invita). Sin coincidencia, 403.
//
//  Anti-replay: aun pasando la validación, el UNIQUE de mgmt_ip en
//  user_mgmt_ips impide colisiones (un usuario, una IP).
router.post('/tunnel/register-my-ip', asyncHandler(async (req, res) => {
  const { ip, user, pass } = requireMikrotik(req);
  const acc = req.account;
  const { mgmtIp } = req.body;
  if (!acc?.sub || !acc?.workspace_id) throw new AppError('Sesión inválida', 401, 'UNAUTHORIZED');
  const cleanIp = String(mgmtIp || '').split('/')[0].trim();
  if (!IPV4_REGEX.test(cleanIp) || !mgmtNet.isMgmtIp(cleanIp)) {
    throw new AppError(`IP de gestión inválida (debe ser ${mgmtNet.clients.net} o ${mgmtNet.admin.net})`, 400, 'VALIDATION_ERROR');
  }
  let api;
  try {
    api = await connectToMikrotik(ip, user, pass);
    const peers = await safeWrite(api, ['/interface/wireguard/peers/print']);
    await api.close().catch(() => {});
    const peer = (peers || []).find(p =>
      mgmtNet.userIfaces.includes(p.interface) &&
      (p['allowed-address'] || '').split(',').some(a => a.split('/')[0].trim() === cleanIp)
    );
    if (!peer) {
      throw new AppError(`No existe un peer de gestión con IP ${cleanIp}. Crea tu WireGuard primero.`, 404, 'NOT_FOUND');
    }

    // ── Q5: validación de ownership por rol ──────────────────────────────────
    const peerKey = peer['public-key'] || '';
    if (!acc.platform_admin) {
      const isMember = acc.role === 'MEMBER';
      if (isMember) {
        // MEMBER: el peer debe ser EL SUYO (creado al aceptar la invitación).
        const myWg = await memberWgRepo.getByUser(acc.workspace_id, acc.sub);
        if (!myWg || !myWg.public_key || myWg.public_key !== peerKey) {
          log.warn({ userId: acc.sub, requestedIp: cleanIp, peerKey: peerKey.slice(0, 8) + '…' },
            'register-my-ip: MEMBER intentó reclamar IP de peer ajeno');
          throw new AppError('Ese peer no te pertenece. Pide al moderador que te asigne uno.', 403, 'NOT_YOUR_PEER');
        }
      } else {
        // OWNER (moderador): el peer debe pertenecer al workspace.
        const db = await getDb();
        const owner = await db.get(
          'SELECT workspace_id FROM mgmt_peer_owners WHERE public_key = ?',
          [peerKey]
        );
        if (!owner || owner.workspace_id !== acc.workspace_id) {
          log.warn({ userId: acc.sub, role: acc.role, requestedIp: cleanIp, peerKey: peerKey.slice(0, 8) + '…' },
            'register-my-ip: moderador intentó reclamar peer fuera de su workspace');
          throw new AppError('Ese peer no pertenece a tu workspace.', 403, 'PEER_FOREIGN_WORKSPACE');
        }
      }
    }

    await mgmtIpRepo.upsert({
      workspaceId: acc.workspace_id, userId: acc.sub,
      mgmtIp: cleanIp, publicKey: peerKey || null, source: 'manual',
    });
    return sendOk(res, { mgmtIp: cleanIp });
  } catch (error) {
    if (api) try { await api.close(); } catch (_) { /* ignore */ }
    if (error instanceof AppError) throw error;
    // p.ej. uq_umi_ip → la IP ya pertenece a otro usuario
    const dup = /uq_umi_ip|Duplicate entry/i.test(error?.message || '');
    if (dup) throw new AppError('Esa IP ya está asignada a otro usuario', 409, 'DUPLICATE');
    throw mikrotikAppError(error, ip, user);
  }
}));

module.exports = router;
