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
//   POST /tunnel/mangle-access    → legacy single-user (limpieza + 1 regla)
//
//  ★ Aislamiento: la IP de gestión SIEMPRE se resuelve server-side desde
//    user_mgmt_ips. NUNCA se acepta del body — anti-spoofing.
// ============================================================

const express = require('express');
const router = express.Router();

const log = require('../../lib/logger').child({ scope: 'core:tunnel' });
const { connectToMikrotik, safeWrite, getErrorMessage, writeIdempotent } = require('../../routeros.service');
const { IPV4_REGEX } = require('../../ubiquiti.service');
const sessionRepo = require('../../db/repos/sessionRepo');
const mgmtIpRepo = require('../../db/repos/mgmtIpRepo');
const provisioner = require('../../lib/tunnelProvisioner');
const {
  addSseClient, removeSseClient, emitToUser, clientIpOf, canUseTunnel,
} = require('./_shared');

// ── POST /tunnel/activate — Multi-usuario: 1 túnel activo por usuario ─────────
//  Crea UNA mangle por IP de gestión del usuario (no por toda la /24).
//  Coexiste con las de otros usuarios → activaciones simultáneas aisladas.
router.post('/tunnel/activate', async (req, res) => {
  if (!req.mikrotik) return res.status(503).json({ success: false, needsConfig: true, message: 'Configura las credenciales MikroTik en Ajustes antes de continuar.' });
  const { ip, user, pass } = req.mikrotik;
  const acc = req.account;
  const { targetVRF } = req.body;
  const clientIp = clientIpOf(req);

  // ── Validaciones de identidad y entrada ───────────────────────────────────
  if (!acc?.sub || !acc?.workspace_id) return res.status(401).json({ success: false, message: 'Sesión inválida' });
  if (!targetVRF) return res.status(400).json({ success: false, message: 'targetVRF requerido' });

  // 1) Permiso sobre el VRF (workspace / asignación)
  const perm = await canUseTunnel(req, targetVRF);
  if (!perm.ok) {
    await sessionRepo.log({ workspaceId: acc.workspace_id, userId: acc.sub, tunnelId: targetVRF, action: 'ERROR', statusCode: perm.code, message: perm.msg, ipAddress: clientIp });
    return res.status(perm.code).json({ success: false, message: perm.msg });
  }

  // 2) IP de gestión del usuario (SERVER-SIDE — nunca del body → anti-spoofing)
  const mgmtIp = await mgmtIpRepo.getMgmtIpForUser(acc.workspace_id, acc.sub);
  if (!mgmtIp) {
    return res.status(409).json({ success: false, code: 'NO_MGMT_IP', message: 'Tu dispositivo de gestión (WireGuard) no está registrado. Contacta al moderador.' });
  }
  if (!IPV4_REGEX.test(mgmtIp)) {
    return res.status(500).json({ success: false, message: `IP de gestión inválida en BD: "${mgmtIp}"` });
  }

  let apiRead, apiWrite;
  try {
    const prev = await sessionRepo.getActiveByUser(acc.workspace_id, acc.sub);

    // ── Fase A (conexión de LECTURA): validar VRF + hallar mangle previa del usuario ──
    apiRead = await connectToMikrotik(ip, user, pass);
    const vrfOk = await provisioner.vrfExists(apiRead, targetVRF);
    if (!vrfOk) {
      await apiRead.close().catch(() => {});
      await sessionRepo.log({ workspaceId: acc.workspace_id, userId: acc.sub, tunnelId: targetVRF, action: 'ERROR', statusCode: 400, message: 'VRF inexistente', ipAddress: clientIp });
      return res.status(400).json({ success: false, message: `El VRF ${targetVRF} no existe en el router` });
    }
    const oldIds = await provisioner.findUserMangleIds(apiRead, acc.sub);
    // Auto-sanado: detectar mangle GLOBAL legacy (single-user) para eliminarla.
    const legacyIds = await provisioner.findLegacyGlobalMangleIds(apiRead);
    await apiRead.close().catch(() => {});

    // ── Fase B (conexión de ESCRITURA): remover previa del usuario + legacy global + crear nueva ──
    apiWrite = await connectToMikrotik(ip, user, pass);
    await provisioner.removeMangleIds(apiWrite, oldIds);            // cambio de túnel: cierra el suyo
    if (legacyIds.length) {
      await provisioner.removeMangleIds(apiWrite, legacyIds);     // elimina mangle global legacy
      log.info({ count: legacyIds.length }, 'TUNNEL-ACTIVATE: mangle global legacy eliminada');
    }
    await provisioner.addUserMangle(apiWrite, { userId: acc.sub, mgmtIp, vrfName: targetVRF });
    await apiWrite.close().catch(() => {});

    // 3) Crear la nueva sesión (la transacción cierra cualquier ACTIVE previa
    //    del usuario internamente — C5: sin doble cierre redundante).
    const { id: sessionId, expires_at } = await sessionRepo.createSession({
      workspaceId: acc.workspace_id, userId: acc.sub,
      tunnelId: targetVRF, vrfName: targetVRF, mgmtIp,
    });

    await sessionRepo.log({ workspaceId: acc.workspace_id, sessionId, userId: acc.sub, tunnelId: targetVRF, action: prev ? 'SWITCH' : 'ACTIVATE', mgmtIp, statusCode: 200, ipAddress: clientIp });
    log.info({ userId: acc.sub, mgmtIp, vrf: targetVRF, mode: prev ? 'switch' : 'nuevo' }, 'TUNNEL-ACTIVATE');

    // 4) Notificar SOLO a este usuario (sus pestañas)
    emitToUser(acc.sub, targetVRF, expires_at);

    return res.json({
      success: true,
      message: `Acceso abierto a ${targetVRF}`,
      vrf: targetVRF,
      ipCliente: mgmtIp,
      sessionId,
      tunnelExpiry: expires_at,
    });
  } catch (error) {
    if (apiRead) try { await apiRead.close(); } catch (_) {}
    if (apiWrite) try { await apiWrite.close(); } catch (_) {}
    // Contención: limpiar cualquier mangle parcial del usuario (conexión fresca)
    try {
      const a = await connectToMikrotik(ip, user, pass);
      const ids = await provisioner.findUserMangleIds(a, acc.sub).catch(() => []);
      await a.close().catch(() => {});
      if (ids.length) { const b = await connectToMikrotik(ip, user, pass); await provisioner.removeMangleIds(b, ids); await b.close().catch(() => {}); }
    } catch (_) { /* limpieza best-effort */ }
    const msg = getErrorMessage(error, ip, user);
    await sessionRepo.log({ workspaceId: acc.workspace_id, userId: acc.sub, tunnelId: targetVRF, action: 'ERROR', statusCode: 500, message: msg, ipAddress: clientIp });
    log.error({ err: error?.message, code: error?.code }, 'TUNNEL-ACTIVATE Error');
    return res.status(500).json({ success: false, message: msg });
  }
});

// ── POST /tunnel/deactivate — cierra SOLO la sesión del usuario actual ────────
router.post('/tunnel/deactivate', async (req, res) => {
  if (!req.mikrotik) return res.status(503).json({ success: false, needsConfig: true, message: 'Configura las credenciales MikroTik en Ajustes antes de continuar.' });
  const { ip, user, pass } = req.mikrotik;
  const acc = req.account;
  const clientIp = clientIpOf(req);
  if (!acc?.sub || !acc?.workspace_id) return res.status(401).json({ success: false, message: 'Sesión inválida' });

  let apiRead, apiWrite;
  try {
    const session = await sessionRepo.getActiveByUser(acc.workspace_id, acc.sub);

    // Idempotente: aunque no haya sesión en BD, intentamos limpiar la mangle del usuario.
    apiRead = await connectToMikrotik(ip, user, pass);
    const ids = await provisioner.findUserMangleIds(apiRead, acc.sub);
    await apiRead.close().catch(() => {});

    if (ids.length) {
      apiWrite = await connectToMikrotik(ip, user, pass);
      await provisioner.removeMangleIds(apiWrite, ids);
      await apiWrite.close().catch(() => {});
    }

    // Solo se llega aquí si la mangle se eliminó con éxito (findUserMangleIds y
    // removeMangleIds LANZAN ante fallo → caen al catch sin cerrar la sesión). C1.
    if (session) await sessionRepo.closeSession(session.id);
    await sessionRepo.log({ workspaceId: acc.workspace_id, sessionId: session?.id, userId: acc.sub, tunnelId: session?.tunnel_id || '-', action: 'DEACTIVATE', statusCode: 200, ipAddress: clientIp });
    log.info({ userId: acc.sub, count: ids.length }, 'TUNNEL-DEACTIVATE: mangles eliminadas');

    emitToUser(acc.sub, null, null);
    res.json({ success: true, message: 'Tu acceso fue revocado' });
  } catch (error) {
    if (apiRead) try { await apiRead.close(); } catch (_) {}
    if (apiWrite) try { await apiWrite.close(); } catch (_) {}
    // La sesión NO se cerró: el acceso sigue vigente. El usuario debe reintentar. (C1)
    await sessionRepo.log({ workspaceId: acc.workspace_id, userId: acc.sub, tunnelId: '-', action: 'ERROR', statusCode: 500, message: `deactivate falló: ${error?.message}`, ipAddress: clientIp });
    res.status(500).json({ success: false, message: `No se pudo revocar el acceso (router sin responder). Reintenta. Detalle: ${getErrorMessage(error, ip, user)}` });
  }
});

// ── POST /tunnel/keepalive — recrea la mangle DEL USUARIO si falta + renueva TTL ──
router.post('/tunnel/keepalive', async (req, res) => {
  if (!req.mikrotik) return res.status(503).json({ success: false, needsConfig: true, message: 'Configura las credenciales MikroTik en Ajustes antes de continuar.' });
  const { ip, user, pass } = req.mikrotik;
  const acc = req.account;
  if (!acc?.sub || !acc?.workspace_id) return res.status(401).json({ success: false, message: 'Sesión inválida' });

  let apiRead, apiWrite;
  try {
    const session = await sessionRepo.getActiveByUser(acc.workspace_id, acc.sub);
    if (!session) return res.json({ success: true, restored: false, restoredItems: [], note: 'sin sesión activa' });

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
    res.json({ success: true, restored, restoredItems });
  } catch (error) {
    if (apiRead) try { await apiRead.close(); } catch (_) {}
    if (apiWrite) try { await apiWrite.close(); } catch (_) {}
    const msg = getErrorMessage(error, ip, user);
    log.error({ err: error?.message }, 'KEEPALIVE Error');
    res.status(500).json({ success: false, message: msg });
  }
});

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
router.get('/tunnel/status', async (req, res) => {
  const acc = req.account;
  if (!acc?.sub || !acc?.workspace_id) return res.json({ success: true, activeNodeVrf: null, tunnelExpiry: null });
  try {
    const session = await sessionRepo.getActiveByUser(acc.workspace_id, acc.sub);
    if (!session) return res.json({ success: true, activeNodeVrf: null, tunnelExpiry: null });

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
          if (a) try { await a.close(); } catch (_) {}
          if (b) try { await b.close(); } catch (_) {}
          // No se pudo revocar en el router → NO cerramos la sesión; se reintenta.
          log.warn({ err: e?.message }, 'TUNNEL-STATUS: limpieza falló al expirar, se mantiene ACTIVE');
          return res.json({ success: true, activeNodeVrf: session.vrf_name, tunnelExpiry: session.expires_at });
        }
      }
      // Mangle eliminada (o sin router configurado) → ahora sí cerrar en BD.
      await sessionRepo.closeSession(session.id);
      await sessionRepo.log({ workspaceId: acc.workspace_id, sessionId: session.id, userId: acc.sub, tunnelId: session.tunnel_id, action: 'EXPIRE', statusCode: 200 });
      emitToUser(acc.sub, null, null);
      return res.json({ success: true, activeNodeVrf: null, tunnelExpiry: null });
    }

    return res.json({ success: true, activeNodeVrf: session.vrf_name, tunnelExpiry: session.expires_at });
  } catch (e) {
    log.warn({ err: e?.message }, 'TUNNEL-STATUS error');
    return res.json({ success: true, activeNodeVrf: null, tunnelExpiry: null });
  }
});

// ── GET /tunnel/my-mgmt-ip — ¿tengo IP de gestión registrada? ────────────────
router.get('/tunnel/my-mgmt-ip', async (req, res) => {
  const acc = req.account;
  if (!acc?.sub || !acc?.workspace_id) return res.status(401).json({ success: false });
  try {
    const ip = await mgmtIpRepo.getMgmtIpForUser(acc.workspace_id, acc.sub);
    res.json({ success: true, mgmtIp: ip });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ── POST /tunnel/register-my-ip — el usuario declara SU IP de gestión ─────────
//  Seguridad: se valida que exista un peer con esa IP en VPN-WG-MGMT antes de
//  guardar (no se permite mapear una IP arbitraria). source='manual'.
router.post('/tunnel/register-my-ip', async (req, res) => {
  if (!req.mikrotik) return res.status(503).json({ success: false, needsConfig: true, message: 'Configura las credenciales MikroTik en Ajustes antes de continuar.' });
  const { ip, user, pass } = req.mikrotik;
  const acc = req.account;
  const { mgmtIp } = req.body;
  if (!acc?.sub || !acc?.workspace_id) return res.status(401).json({ success: false, message: 'Sesión inválida' });
  const cleanIp = String(mgmtIp || '').split('/')[0].trim();
  if (!IPV4_REGEX.test(cleanIp) || !cleanIp.startsWith('192.168.21.')) {
    return res.status(400).json({ success: false, message: 'IP de gestión inválida (debe ser 192.168.21.x)' });
  }
  let api;
  try {
    api = await connectToMikrotik(ip, user, pass);
    const peers = await safeWrite(api, ['/interface/wireguard/peers/print']);
    await api.close().catch(() => {});
    const peer = (peers || []).find(p =>
      p.interface === 'VPN-WG-MGMT' &&
      (p['allowed-address'] || '').split(',').some(a => a.split('/')[0].trim() === cleanIp)
    );
    if (!peer) {
      return res.status(404).json({ success: false, message: `No existe un peer de gestión con IP ${cleanIp}. Crea tu WireGuard primero.` });
    }
    await mgmtIpRepo.upsert({
      workspaceId: acc.workspace_id, userId: acc.sub,
      mgmtIp: cleanIp, publicKey: peer['public-key'] || null, source: 'manual',
    });
    res.json({ success: true, mgmtIp: cleanIp });
  } catch (error) {
    if (api) try { await api.close(); } catch (_) {}
    // p.ej. uq_umi_ip → la IP ya pertenece a otro usuario
    const dup = /uq_umi_ip|Duplicate entry/i.test(error?.message || '');
    res.status(dup ? 409 : 500).json({
      success: false,
      message: dup ? 'Esa IP ya está asignada a otro usuario' : getErrorMessage(error, ip, user),
    });
  }
});

// ── POST /tunnel/mangle-access (legacy single-user) ─────────────────────────
// Limpia todas las reglas mangle con comment="ACCESO-DINAMICO" o "ACCESO-ADMIN"
// e inyecta UNA sola regla ACCESO-ADMIN con src-address=192.168.21.0/24.
//
// Body: { vrfSeleccionado: "VRF-ND4-TORREVICTORN2" }
router.post('/tunnel/mangle-access', async (req, res) => {
  if (!req.mikrotik) return res.status(503).json({ success: false, needsConfig: true, message: 'Configura las credenciales MikroTik en Ajustes antes de continuar.' });
  const { ip, user, pass } = req.mikrotik;

  const { vrfSeleccionado, ipCliente: ipClienteBody } = req.body;
  if (!vrfSeleccionado || typeof vrfSeleccionado !== 'string' || !vrfSeleccionado.trim()) {
    return res.status(400).json({ success: false, message: 'vrfSeleccionado es requerido en el body.' });
  }

  // Prioridad: body.ipCliente → X-Forwarded-For → socket remoteAddress
  let ipCliente = '';
  if (ipClienteBody && typeof ipClienteBody === 'string') {
    ipCliente = ipClienteBody.trim();
  } else {
    ipCliente = clientIpOf(req);
  }
  log.debug({ ipCliente, vrf: vrfSeleccionado }, 'MANGLE-ACCESS request');

  if (!ipCliente) {
    return res.status(400).json({ success: false, message: 'No se pudo determinar la IP del operador.' });
  }

  // Validar que sea una IPv4 válida antes de enviar a RouterOS
  if (!IPV4_REGEX.test(ipCliente)) {
    return res.status(400).json({ success: false, message: `IP del operador no es IPv4 válida: "${ipCliente}"` });
  }

  const vrf = vrfSeleccionado.trim();

  // ──────────────────────────────────────────────────────────────────────────
  // ESTRATEGIA: usar conexiones separadas por fase para evitar desincronización
  // del protocolo node-routeros cuando se hacen múltiples add consecutivos.
  // Fase 1: conn1 → print + cleanup de ACCESO-DINAMICO y ACCESO-ADMIN
  // Fase 2: conn2 → add única regla ACCESO-ADMIN (con writeIdempotent)
  // ──────────────────────────────────────────────────────────────────────────

  // ── Fase 1: Limpieza ──────────────────────────────────────────────────────
  let api1;
  let deletedCount = 0;
  try {
    api1 = await connectToMikrotik(ip, user, pass);
    const allMangle = await safeWrite(api1, ['/ip/firewall/mangle/print'], 15000).catch((e) => {
      log.warn({ err: e?.message }, 'MANGLE-ACCESS print falló');
      return [];
    });
    const toDelete = allMangle.filter(m =>
      (m.comment === 'ACCESO-DINAMICO' || m.comment === 'ACCESO-ADMIN') && m['.id']
    );
    log.debug({ total: allMangle.length, toDelete: toDelete.length }, 'MANGLE-ACCESS inventario');

    for (const rule of toDelete) {
      try {
        await safeWrite(api1, ['/ip/firewall/mangle/remove', `=.id=${rule['.id']}`], 10000);
        deletedCount++;
      } catch (e) {
        log.warn({ id: rule['.id'], err: e?.message }, 'MANGLE-ACCESS remove falló');
      }
    }
    log.debug({ deletedCount }, 'MANGLE-ACCESS Cleanup terminado');
  } catch (error) {
    if (api1) try { await api1.close(); } catch (_) {}
    const msg = getErrorMessage(error, ip, user);
    log.error({ err: error?.message || String(error) }, 'MANGLE-ACCESS fase 1 cleanup');
    return res.status(500).json({ success: false, message: `Cleanup falló: ${msg}` });
  }
  try { await api1.close(); } catch (_) { /* noop */ }

  // Pausa entre fases para que RouterOS asiente los removes
  await new Promise(r => setTimeout(r, 300));

  // ── Fase 2: Add en conexión fresca ────────────────────────────────────────
  // Una sola regla ACCESO-ADMIN con src-address=192.168.21.0/24 cubre todo el pool.
  let api2;
  try {
    api2 = await connectToMikrotik(ip, user, pass);

    log.debug({ vrf }, 'MANGLE-ACCESS Creando regla ACCESO-ADMIN');
    await writeIdempotent(api2, [
      '/ip/firewall/mangle/add',
      '=chain=prerouting',
      '=action=mark-routing',
      '=comment=ACCESO-ADMIN',
      '=dst-address-list=LIST-NET-REMOTE-TOWERS',
      `=new-routing-mark=${vrf}`,
      '=src-address=192.168.21.0/24',
      '=passthrough=yes',
    ], 12000);
    log.info('MANGLE-ACCESS Regla ACCESO-ADMIN creada');

    try { await api2.close(); } catch (_) { /* noop */ }

    return res.json({
      success: true,
      message: `Regla ACCESO-ADMIN aplicada: 192.168.21.0/24 → ${vrf}`,
      vrf,
      ipCliente,
      deletedCount,
    });
  } catch (error) {
    if (api2) try { await api2.close(); } catch (_) {}
    const msg = getErrorMessage(error, ip, user);
    log.error({ err: error?.message || String(error) }, 'MANGLE-ACCESS fase 2 add');
    return res.status(500).json({ success: false, message: `Add falló: ${msg}` });
  }
});

module.exports = router;
