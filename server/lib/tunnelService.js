// ============================================================
//  tunnelService.js — Lógica de activate/deactivate compartida.
//
//  Extraído de routes/core/tunnel.routes.js para que tanto el HTTP
//  route como el bot de Telegram (M1+) la consuman desde un único
//  lugar. SSE emit y notificaciones quedan adentro.
//
//  Funciones puras-ish: reciben { account, mikrotik, ... } y devuelven
//  { ok, ...result } o { ok: false, code, message }. No tocan req/res.
// ============================================================

const log = require('./logger').child({ scope: 'tunnel-service' });
const { connectToMikrotik, getErrorMessage, isUnreachable } = require('../routeros.service');
const { IPV4_REGEX } = require('../ubiquiti.service');
const sessionRepo = require('../db/repos/sessionRepo');
const mgmtIpRepo = require('../db/repos/mgmtIpRepo');
const notifier = require('./notifier');
const provisioner = require('./tunnelProvisioner');
const { canUseTunnelForAccount, emitToUser } = require('../routes/core/_shared');

/**
 * Activa el VRF indicado para el usuario.
 *
 * @param {object} args
 * @param {object} args.account            — { sub, workspace_id, role, platform_admin }
 * @param {string} args.targetVRF
 * @param {{ip,user,pass}} args.mikrotik   — credenciales del router central
 * @param {string} [args.clientIp]         — IP forense (opcional, '-' si falta)
 * @returns {Promise<{ok:true, sessionId, expiresAt, mgmtIp, vrf, switched}|{ok:false, code, message}>}
 */
async function activateTunnel({ account, targetVRF, mikrotik, clientIp = '-' }) {
  if (!account?.sub || !account?.workspace_id) return { ok: false, code: 401, message: 'Sesión inválida' };
  if (!targetVRF) return { ok: false, code: 400, message: 'targetVRF requerido' };
  if (!mikrotik?.ip || !mikrotik?.user) return { ok: false, code: 503, message: 'MikroTik no configurado' };

  const { ip, user, pass } = mikrotik;

  // 1) Permiso sobre el VRF
  const perm = await canUseTunnelForAccount(account, targetVRF);
  if (!perm.ok) {
    await sessionRepo.log({ workspaceId: account.workspace_id, userId: account.sub, tunnelId: targetVRF, action: 'ERROR', statusCode: perm.code, message: perm.msg, ipAddress: clientIp });
    return { ok: false, code: perm.code, message: perm.msg };
  }

  // 2) IP de gestión (server-side — anti-spoofing)
  const mgmtIp = await mgmtIpRepo.getMgmtIpForUser(account.workspace_id, account.sub);
  if (!mgmtIp) {
    return { ok: false, code: 409, message: 'Tu dispositivo de gestión (WireGuard) no está registrado. Pide al moderador que te asigne uno.' };
  }
  if (!IPV4_REGEX.test(mgmtIp)) {
    return { ok: false, code: 500, message: `IP de gestión inválida en BD: "${mgmtIp}"` };
  }

  let apiRead, apiWrite;
  try {
    const prev = await sessionRepo.getActiveByUser(account.workspace_id, account.sub);

    // Fase A — lectura
    apiRead = await connectToMikrotik(ip, user, pass);
    const vrfOk = await provisioner.vrfExists(apiRead, targetVRF);
    if (!vrfOk) {
      await apiRead.close().catch(() => {});
      await sessionRepo.log({ workspaceId: account.workspace_id, userId: account.sub, tunnelId: targetVRF, action: 'ERROR', statusCode: 400, message: 'VRF inexistente', ipAddress: clientIp });
      return { ok: false, code: 400, message: `El VRF ${targetVRF} no existe en el router` };
    }
    const oldIds = await provisioner.findUserMangleIds(apiRead, account.sub);
    const legacyIds = await provisioner.findLegacyGlobalMangleIds(apiRead);
    await apiRead.close().catch(() => {});

    // Fase B — escritura
    apiWrite = await connectToMikrotik(ip, user, pass);
    await provisioner.removeMangleIds(apiWrite, oldIds);
    if (legacyIds.length) {
      await provisioner.removeMangleIds(apiWrite, legacyIds);
      log.info({ count: legacyIds.length }, 'mangle global legacy eliminada');
    }
    await provisioner.addUserMangle(apiWrite, { userId: account.sub, mgmtIp, vrfName: targetVRF });
    await apiWrite.close().catch(() => {});

    // 3) Sesión en BD
    const { id: sessionId, expires_at } = await sessionRepo.createSession({
      workspaceId: account.workspace_id, userId: account.sub,
      tunnelId: targetVRF, vrfName: targetVRF, mgmtIp,
    });

    await sessionRepo.log({ workspaceId: account.workspace_id, sessionId, userId: account.sub, tunnelId: targetVRF, action: prev ? 'SWITCH' : 'ACTIVATE', mgmtIp, statusCode: 200, ipAddress: clientIp });
    log.info({ userId: account.sub, mgmtIp, vrf: targetVRF, mode: prev ? 'switch' : 'nuevo' }, 'ACTIVATE OK');

    // 4) SSE → todas las pestañas del usuario (panel sigue funcionando aunque mute desde el bot)
    emitToUser(account.sub, targetVRF, expires_at);

    // 5) Notificación (best-effort)
    notifier.notify({
      userId: account.sub,
      event: 'TUNNEL_ACTIVATED',
      payload: { tunnelId: targetVRF, vrf: targetVRF, expiresAt: expires_at, ip: clientIp },
    }).catch((err) => log.warn({ err: err.message }, 'notify TUNNEL_ACTIVATED falló'));

    return { ok: true, sessionId, expiresAt: expires_at, mgmtIp, vrf: targetVRF, switched: !!prev };
  } catch (error) {
    if (apiRead) try { await apiRead.close(); } catch (_) {}
    if (apiWrite) try { await apiWrite.close(); } catch (_) {}
    // Contención: limpiar mangle parcial del usuario (conexión fresca)
    try {
      const a = await connectToMikrotik(ip, user, pass);
      const ids = await provisioner.findUserMangleIds(a, account.sub).catch(() => []);
      await a.close().catch(() => {});
      if (ids.length) {
        const b = await connectToMikrotik(ip, user, pass);
        await provisioner.removeMangleIds(b, ids);
        await b.close().catch(() => {});
      }
    } catch (_) { /* best-effort */ }
    const msg = getErrorMessage(error, ip, user);
    const unreachable = isUnreachable(error);
    await sessionRepo.log({ workspaceId: account.workspace_id, userId: account.sub, tunnelId: targetVRF, action: 'ERROR', statusCode: unreachable ? 503 : 500, message: msg, ipAddress: clientIp });
    log.error({ err: error?.message, code: error?.code }, 'ACTIVATE error');
    return { ok: false, code: unreachable ? 503 : 500, message: msg, unreachable };
  }
}

/**
 * Cierra la sesión del usuario (mangle + BD). Idempotente.
 *
 * @returns {Promise<{ok:true, hadSession:boolean, tunnelId?:string, vrf?:string}|{ok:false, code, message}>}
 */
async function deactivateTunnel({ account, mikrotik, clientIp = '-' }) {
  if (!account?.sub || !account?.workspace_id) return { ok: false, code: 401, message: 'Sesión inválida' };
  if (!mikrotik?.ip || !mikrotik?.user) return { ok: false, code: 503, message: 'MikroTik no configurado' };
  const { ip, user, pass } = mikrotik;

  let apiRead, apiWrite;
  try {
    const session = await sessionRepo.getActiveByUser(account.workspace_id, account.sub);

    apiRead = await connectToMikrotik(ip, user, pass);
    const ids = await provisioner.findUserMangleIds(apiRead, account.sub);
    await apiRead.close().catch(() => {});

    if (ids.length) {
      apiWrite = await connectToMikrotik(ip, user, pass);
      await provisioner.removeMangleIds(apiWrite, ids);
      await apiWrite.close().catch(() => {});
    }

    if (session) await sessionRepo.closeSession(session.id);
    await sessionRepo.log({ workspaceId: account.workspace_id, sessionId: session?.id, userId: account.sub, tunnelId: session?.tunnel_id || '-', action: 'DEACTIVATE', statusCode: 200, ipAddress: clientIp });
    log.info({ userId: account.sub, count: ids.length }, 'DEACTIVATE OK');

    emitToUser(account.sub, null, null);

    if (session) {
      notifier.notify({
        userId: account.sub,
        event: 'TUNNEL_DEACTIVATED',
        payload: { tunnelId: session.tunnel_id, vrf: session.vrf_name, ip: clientIp },
      }).catch((err) => log.warn({ err: err.message }, 'notify TUNNEL_DEACTIVATED falló'));
    }

    return { ok: true, hadSession: !!session, tunnelId: session?.tunnel_id, vrf: session?.vrf_name };
  } catch (error) {
    if (apiRead) try { await apiRead.close(); } catch (_) {}
    if (apiWrite) try { await apiWrite.close(); } catch (_) {}
    await sessionRepo.log({ workspaceId: account.workspace_id, userId: account.sub, tunnelId: '-', action: 'ERROR', statusCode: 500, message: `deactivate falló: ${error?.message}`, ipAddress: clientIp });
    return { ok: false, code: 500, message: `No se pudo revocar el acceso (router sin responder). ${getErrorMessage(error, ip, user)}` };
  }
}

module.exports = { activateTunnel, deactivateTunnel };
