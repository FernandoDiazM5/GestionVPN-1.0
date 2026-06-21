// ============================================================
//  Rutas del Administrador de plataforma (Sistemas) — /api/admin
//  Solo accesible con sesión platform_admin. Dashboard global +
//  alta/gestión de Moderadores (cada uno = OWNER de su workspace).
// ============================================================
const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const {
  CreateModeratorRequestSchema,
  ModeratorPatchRequestSchema,
  InviteModeratorRequestSchema,
} = require('@gestionvpn/contracts');

const { asyncHandler, AppError, sendOk } = require('../lib/apiResponse');
const { query, withTransaction } = require('../db/mysql');
const { requireSession, requirePlatformAdmin, invalidateUserCache } = require('../middleware/authJwt');
const workspaceRepo = require('../db/repos/workspaceRepo');
const invitationRepo = require('../db/repos/invitationRepo');
const userRepo = require('../db/repos/userRepo');
const { sendInvitation } = require('../lib/mailer');
const { removePeersFromRouter } = require('../lib/routerCleanup');
const { setPeersEnabled, removeUserMangles } = require('../lib/routerPeerState');
const { deprovisionNodeOnRouter } = require('../lib/nodeDeprovision');
const { getAppSetting, decryptPass } = require('../db.service');

// Credenciales del router core desde app_settings (las rutas admin no pasan por
// el middleware legacy que inyecta req.mikrotik). null si no hay config.
async function getMikrotikCreds() {
  const ip = await getAppSetting('MT_IP');
  const user = await getAppSetting('MT_USER');
  const passData = await getAppSetting('MT_PASS');
  if (!ip || !user || !passData) return null;
  return { ip, user, pass: decryptPass(passData) };
}

// Limpieza best-effort del MikroTik tras borrar un workspace/moderador. Se ejecuta
// FUERA de la respuesta HTTP (en segundo plano): si el router está caído o el login
// de la API cuelga (acotado a ~9s por conexión en routeros.service), el borrado en
// BD ya se hizo y la UI NO queda esperando. Los peers/mangles que no se puedan
// limpiar quedan inertes y se purgan a mano (ver pendientes del handoff).
//   ⚠️ NO toca LIST-NET-REMOTE-TOWERS (LAN compartidas entre nodos hermanos).
async function cleanupWorkspaceOnRouter({ wsId, publicKeys, userIds, nodeRows }) {
  const routerCleanup = await removePeersFromRouter(publicKeys);   // peers WG del ws
  const mangleCleanup = await removeUserMangles(userIds);          // mangles por-usuario
  let nodesDeprovisioned = 0;
  const mtCreds = await getMikrotikCreds();
  if (mtCreds) {
    for (const n of nodeRows) {
      try {
        await deprovisionNodeOnRouter(mtCreds, { pppUser: n.ppp_user, vrfName: n.nombre_vrf });
        nodesDeprovisioned++;
      } catch (e) {
        log.warn({ pppUser: n.ppp_user, err: e.message }, 'deprovision de nodo falló (best-effort)');
      }
    }
  }
  log.info({ wsId, routerCleanup, mangleCleanup, nodesDeprovisioned },
    'cleanup de router tras borrar moderador completado');
}

const INVITE_TTL_MS = 24 * 60 * 60 * 1000; // 24h — igual que team.routes.js
const genOtp = () => String(crypto.randomInt(100000, 1000000));
const log = require('../lib/logger').child({ scope: 'admin' });

// Enlace público de aceptación (mismo formato que lib/mailer.sendInvitation):
// el moderador lo abre y queda con email + OTP precargados.
function buildAcceptUrl(email, otp) {
  const base = (process.env.APP_BASE_URL || 'http://localhost:5173/GestionVPN-1.0/').replace(/\/+$/, '/');
  return `${base}?accept=1&email=${encodeURIComponent(email)}&otp=${encodeURIComponent(otp)}`;
}

const router = express.Router();
router.use(requireSession, requirePlatformAdmin);

// ── GET /api/admin/summary — métricas globales para el Dashboard ──
router.get('/summary', asyncHandler(async (_req, res) => {
  const roles = (await query(
    `SELECT
       SUM(role='OWNER') AS moderadores,
       SUM(role='MEMBER') AS miembros,
       COUNT(*) AS total
     FROM workspace_members WHERE deleted_at IS NULL`
  ))[0] || {};
  const ws = (await query('SELECT COUNT(*) AS total FROM workspaces WHERE deleted_at IS NULL'))[0] || {};
  const usr = (await query('SELECT COUNT(*) AS total FROM users WHERE deleted_at IS NULL'))[0] || {};
  const acts = (await query('SELECT COUNT(*) AS total FROM tunnel_logs WHERE created_at >= ?', [Date.now() - 86400000]))[0] || {};
  const recent = await query(
    `SELECT tl.action, tl.tunnel_id, tl.created_at, u.email AS user_email
       FROM tunnel_logs tl LEFT JOIN users u ON u.id = tl.user_id
      ORDER BY tl.created_at DESC LIMIT 10`
  );

  return sendOk(res, {
    summary: {
      workspaces: Number(ws.total || 0),
      usuarios: Number(usr.total || 0),
      moderadores: Number(roles.moderadores || 0),
      miembros: Number(roles.miembros || 0),
      acciones_24h: Number(acts.total || 0),
    },
    recent,
  });
}));

// ── GET /api/admin/moderators — lista de moderadores (OWNERs) ──
router.get('/moderators', asyncHandler(async (_req, res) => {
  const moderators = await query(
    `SELECT u.id AS user_id, u.email, u.name, u.created_at, u.disabled_at,
            w.id AS workspace_id, w.name AS workspace_name,
            (SELECT COUNT(*) FROM workspace_members m2
              WHERE m2.workspace_id = w.id AND m2.deleted_at IS NULL AND m2.role <> 'OWNER') AS miembros
       FROM workspace_members wm
       JOIN users u ON u.id = wm.user_id
       JOIN workspaces w ON w.id = wm.workspace_id
      WHERE wm.role = 'OWNER' AND wm.deleted_at IS NULL AND w.deleted_at IS NULL
        AND u.deleted_at IS NULL AND u.is_platform_admin = 0
      ORDER BY u.created_at DESC`
  );
  return sendOk(res, {
    moderators: moderators.map(m => ({ ...m, disabled: !!m.disabled_at })),
  });
}));

// Localiza un moderador (OWNER, no platform_admin) por user_id o lanza 404.
async function findModeratorOr404(userId) {
  const rows = await query(
    `SELECT u.id, w.id AS workspace_id
       FROM users u
       JOIN workspace_members wm ON wm.user_id = u.id AND wm.role = 'OWNER' AND wm.deleted_at IS NULL
       JOIN workspaces w ON w.id = wm.workspace_id AND w.deleted_at IS NULL
      WHERE u.id = ? AND u.deleted_at IS NULL AND u.is_platform_admin = 0
      LIMIT 1`,
    [userId]
  );
  if (!rows.length) throw new AppError('Moderador no encontrado', 404, 'NOT_FOUND');
  return rows[0];
}

// ── PATCH /api/admin/moderators/:id — editar nombre / workspace / clave / estado ──
const patchSchema = ModeratorPatchRequestSchema;

router.patch('/moderators/:id', asyncHandler(async (req, res) => {
  const mod = await findModeratorOr404(req.params.id);
  const { name, workspaceName, password, disabled } = patchSchema.parse(req.body);
  const now = Date.now();
  let routerSync = null;
  let mangleCleanup = null;

  if (name !== undefined) {
    await query('UPDATE users SET name = ?, updated_at = ? WHERE id = ?', [name, now, mod.id]);
  }
  if (workspaceName !== undefined) {
    await query('UPDATE workspaces SET name = ?, updated_at = ? WHERE id = ?', [workspaceName, now, mod.workspace_id]);
  }
  if (password !== undefined) {
    await query('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', [await bcrypt.hash(password, 10), now, mod.id]);
  }
  if (disabled !== undefined) {
    // 1) Persistir el estado en BD (todos los users del workspace cuando suspendemos,
    //    solo el OWNER cuando rehabilitamos — los MEMBERs no se reactivan en cadena).
    if (disabled) {
      await query(
        `UPDATE users SET disabled_at = ?, updated_at = ?
           WHERE id IN (SELECT user_id FROM workspace_members WHERE workspace_id = ?)`,
        [now, now, mod.workspace_id]
      );
    } else {
      await query('UPDATE users SET disabled_at = NULL, updated_at = ? WHERE id = ?', [now, mod.id]);
    }

    // 2) Recolectar peers WG del workspace y sincronizar el router (best-effort)
    const peerRows = await query(
      'SELECT public_key FROM member_wireguard WHERE workspace_id = ? AND public_key IS NOT NULL',
      [mod.workspace_id]
    );
    const publicKeys = peerRows.map(r => r.public_key);
    routerSync = await setPeersEnabled(publicKeys, !disabled);

    // 3) Si deshabilitamos: borrar mangles activos + cerrar sesiones + invalidar cache
    if (disabled) {
      const memberIds = await query(
        'SELECT user_id FROM workspace_members WHERE workspace_id = ?',
        [mod.workspace_id]
      );
      const userIds = memberIds.map(r => r.user_id);
      // Borrar mangle activo en el router (corte inmediato del acceso)
      mangleCleanup = await removeUserMangles(userIds);
      // Cerrar sesiones en BD para que keepalive deje de pedir
      await query(
        `UPDATE tunnel_user_sessions
            SET status = 'CLOSED', deactivated_at = ?
          WHERE workspace_id = ? AND status = 'ACTIVE'`,
        [now, mod.workspace_id]
      );
      userIds.forEach(invalidateUserCache);
    }
  }

  return sendOk(res, {
    message: 'Moderador actualizado',
    router: routerSync || undefined,
    mangle: mangleCleanup || undefined,
  });
}));

// ── DELETE /api/admin/moderators/:id — HARD DELETE en cascada ──
//  Elimina TODO lo que pertenece al moderador: workspace, nodos+APs+CPEs+
//  torres, peers WG, sesiones, invitaciones y miembros (cuando no estén en
//  otros workspaces). Libera el email para poder reutilizarlo después.
router.delete('/moderators/:id', asyncHandler(async (req, res) => {
  const mod = await findModeratorOr404(req.params.id);
  const wsId = mod.workspace_id;

  // ── Snapshot de lo que habrá que limpiar en el router, leído ANTES de borrar
  //    en BD. La limpieza del MikroTik es best-effort y NO debe bloquear el
  //    borrado: se hace en segundo plano tras responder (cleanupWorkspaceOnRouter).
  //    Antes se hacía aquí, en línea, y si el login al router colgaba la petición
  //    HTTP nunca respondía → el modal "Eliminar" se quedaba pensando para siempre.
  const peerKeyRows = await query(
    `SELECT public_key FROM mgmt_peer_owners WHERE workspace_id = ?
     UNION
     SELECT public_key FROM member_wireguard WHERE workspace_id = ? AND public_key IS NOT NULL`,
    [wsId, wsId]
  );
  const publicKeys = peerKeyRows.map(r => r.public_key).filter(Boolean);

  const wsUserRows = await query(
    'SELECT user_id FROM workspace_members WHERE workspace_id = ?',
    [wsId]
  );
  const userIds = wsUserRows.map(r => r.user_id);

  const nodeRows = await query(
    'SELECT ppp_user, nombre_vrf FROM nodes WHERE workspace_id = ? AND ppp_user IS NOT NULL',
    [wsId]
  );

  await withTransaction(async (tx) => {
    // 1) Usuarios del workspace (OWNER + MEMBERs) — se usarán al final
    const memberRows = await tx.query(
      'SELECT user_id FROM workspace_members WHERE workspace_id = ?',
      [wsId]
    );
    const wsUserIds = memberRows.map(r => r.user_id);

    // 2) Auditoría / sesiones (FK NOT NULL a workspaces → borrar primero)
    await tx.query('DELETE FROM tunnel_session_logs WHERE workspace_id = ?', [wsId]);
    await tx.query('DELETE FROM tunnel_user_sessions WHERE workspace_id = ?', [wsId]);
    await tx.query('DELETE FROM user_mgmt_ips WHERE workspace_id = ?', [wsId]);
    await tx.query('DELETE FROM tunnel_logs WHERE workspace_id = ?', [wsId]);
    await tx.query('DELETE FROM tunnel_assignments WHERE workspace_id = ?', [wsId]);
    await tx.query('DELETE FROM member_wireguard WHERE workspace_id = ?', [wsId]);
    await tx.query('DELETE FROM workspace_routers WHERE workspace_id = ?', [wsId]);
    await tx.query('DELETE FROM invitations WHERE workspace_id = ?', [wsId]);

    // 3) Equipos / red — torres y cpes requieren join manual (FK SET NULL)
    await tx.query(
      'DELETE t FROM torres t INNER JOIN nodes n ON t.node_id = n.id WHERE n.workspace_id = ?',
      [wsId]
    );
    await tx.query(
      `DELETE c FROM cpes c
        WHERE c.ap_id IN (
          SELECT a.id FROM aps a
          JOIN ap_groups g ON g.id = a.ap_group_id
          WHERE g.workspace_id = ?
        )`,
      [wsId]
    );
    await tx.query('DELETE FROM ap_groups WHERE workspace_id = ?', [wsId]);       // CASCADE → aps, signal_history
    await tx.query('DELETE FROM nodes WHERE workspace_id = ?', [wsId]);            // CASCADE → node_ssh_creds, node_tags, node_history
    await tx.query('DELETE FROM mgmt_peer_owners WHERE workspace_id = ?', [wsId]);

    // 4) Membresías y workspace
    await tx.query('DELETE FROM workspace_members WHERE workspace_id = ?', [wsId]);
    await tx.query('DELETE FROM workspaces WHERE id = ?', [wsId]);

    // 5) Eliminar SOLO los usuarios que no pertenezcan a otros workspaces.
    //    Esto cubre al OWNER y libera su email para reutilización.
    if (wsUserIds.length) {
      const placeholders = wsUserIds.map(() => '?').join(',');
      const stillBelong = await tx.query(
        `SELECT DISTINCT user_id FROM workspace_members WHERE user_id IN (${placeholders})`,
        wsUserIds
      );
      const stillSet = new Set(stillBelong.map(r => r.user_id));
      const toDelete = wsUserIds.filter(id => !stillSet.has(id));
      if (toDelete.length) {
        const ph2 = toDelete.map(() => '?').join(',');
        await tx.query(`DELETE FROM users WHERE id IN (${ph2})`, toDelete);
        // Invalida el cache de auth → el próximo request del user borrado
        // dará 401 USER_DELETED y el frontend lo redirigirá a login.
        toDelete.forEach(invalidateUserCache);
      }
    }
  });

  // Responder de inmediato: el borrado en BD ya está hecho. La limpieza del
  // router (peers WG + mangles + de-provisión de nodos) corre en segundo plano
  // y es best-effort — si el router está caído o el login cuelga, no afecta a
  // la respuesta ni deja al usuario esperando.
  sendOk(res, { message: 'Moderador eliminado completamente' });

  cleanupWorkspaceOnRouter({ wsId, publicKeys, userIds, nodeRows })
    .catch(err => log.warn({ wsId, err: err.message }, 'cleanup de router tras borrar moderador falló'));
}));

// ── POST /api/admin/moderators — alta directa de un Moderador ──
const createSchema = CreateModeratorRequestSchema;

router.post('/moderators', asyncHandler(async (req, res) => {
  const { email, password, name, workspaceName } = createSchema.parse(req.body);

  const existing = await query('SELECT id FROM users WHERE email = ? AND deleted_at IS NULL LIMIT 1', [email]);
  if (existing.length) throw new AppError('Ese email ya está registrado', 409, 'EMAIL_TAKEN');

  const userId = crypto.randomUUID();
  const now = Date.now();
  const wsId = await withTransaction(async (tx) => {
    await tx.query(
      `INSERT INTO users (id, email, password_hash, name, is_platform_admin, email_verified, created_at, updated_at)
       VALUES (?,?,?,?,0,1,?,?)`,
      [userId, email, await bcrypt.hash(password, 10), name || '', now, now]
    );
    const { workspaceId } = await workspaceRepo.createForOwner(tx, {
      ownerId: userId, name: workspaceName || `Espacio de ${name || email.split('@')[0]}`,
    });
    return workspaceId;
  });

  return sendOk(res, {
    moderator: { user_id: userId, email, name: name || '', workspace_id: wsId },
    message: 'Moderador creado',
  }, 201);
}));

// ── POST /api/admin/invite-moderator — invitación por email (flujo OTP) ──
//  Mismo UX que invitar un miembro: solo email, le llega un correo con link;
//  al aceptar, el invitado crea su contraseña y WG, y queda como OWNER de un
//  workspace nuevo creado vacío para él.
const inviteModeratorSchema = InviteModeratorRequestSchema;

router.post('/invite-moderator', asyncHandler(async (req, res) => {
  const { email, name, workspaceName } = inviteModeratorSchema.parse(req.body);

  // ¿Ya existe un usuario activo con ese email?
  const existing = await userRepo.findByEmail(email);
  if (existing) throw new AppError('Ese email ya está registrado', 409, 'EMAIL_TAKEN');

  // ¿Hay invitación PENDING (en cualquier workspace) para este email?
  const pending = await invitationRepo.findPendingByEmail(email);
  if (pending) throw new AppError('Ya existe una invitación pendiente para ese email', 409, 'INVITE_PENDING');

  // Crear workspace placeholder + invitación role=OWNER (todo en transacción)
  const wsName = workspaceName || `Espacio de ${name || email.split('@')[0]}`;
  const inviteId = crypto.randomUUID();
  const wsId = crypto.randomUUID();
  const otp = genOtp();
  const otpHash = await bcrypt.hash(otp, 8);
  const now = Date.now();

  await withTransaction(async (tx) => {
    // owner_id es NOT NULL: usamos al platform_admin como placeholder; en /accept
    // se actualiza al user_id del invitado cuando se convierte en OWNER real.
    await tx.query(
      'INSERT INTO workspaces (id, name, owner_id, created_at, updated_at) VALUES (?,?,?,?,?)',
      [wsId, wsName, req.account.sub, now, now]
    );
    await tx.query(
      `INSERT INTO invitations
         (id, workspace_id, email, name, otp_hash, role, status, invited_by, attempts, expires_at, created_at)
       VALUES (?,?,?,?,?, 'OWNER', 'PENDING', ?, 0, ?, ?)`,
      [inviteId, wsId, email, name?.trim() || null, otpHash, req.account.sub, now + INVITE_TTL_MS, now]
    );
  });

  // Email con link → AcceptInvitationForm (mismo que miembros). El envío NO es
  // fatal: si el SMTP falla (ej. proveedor que bloquea el puerto saliente), la
  // invitación queda creada igual y devolvemos el enlace para compartirlo a mano.
  let emailSent = false;
  let emailError;
  try {
    await sendInvitation({
      email,
      code: otp,
      inviterName: 'El administrador de la plataforma',
      workspaceName: wsName,
      tunnelId: null,
      role: 'OWNER',
    });
    emailSent = true;
  } catch (e) {
    emailError = e.message;
    log.warn({ email, err: e.message }, 'invitación creada pero el email no se pudo enviar; se comparte el enlace manualmente');
  }

  return sendOk(res, {
    message: emailSent ? 'Invitación enviada' : 'Invitación creada (correo no enviado: comparte el enlace)',
    email,
    workspace_id: wsId,
    workspace_name: wsName,
    acceptUrl: buildAcceptUrl(email, otp),
    code: otp,
    emailSent,
    emailError,
  }, 201);
}));

// ── GET /api/admin/invitations — moderadores PENDIENTES por aceptar ──
router.get('/invitations', asyncHandler(async (req, res) => {
  const rows = await query(
    `SELECT i.id, i.email, i.name, i.expires_at, i.created_at, w.name AS workspace_name
       FROM invitations i
       LEFT JOIN workspaces w ON w.id = i.workspace_id
      WHERE i.status = 'PENDING' AND i.role = 'OWNER'
      ORDER BY i.created_at DESC`
  );
  return sendOk(res, { invitations: rows });
}));

// ── POST /api/admin/invitations/:id/link — regenera OTP y devuelve enlace ──
//  El OTP original no se almacena en claro (solo su hash), así que para volver a
//  obtener un enlace válido de un pendiente generamos un OTP nuevo (el anterior
//  queda invalidado) y reseteamos el TTL.
router.post('/invitations/:id/link', asyncHandler(async (req, res) => {
  const inv = await invitationRepo.findById(req.params.id);
  if (!inv || inv.status !== 'PENDING' || inv.role !== 'OWNER') {
    throw new AppError('Invitación no encontrada o ya aceptada', 404, 'NOT_FOUND');
  }
  const otp = genOtp();
  const otpHash = await bcrypt.hash(otp, 8);
  await query(
    'UPDATE invitations SET otp_hash = ?, attempts = 0, expires_at = ? WHERE id = ?',
    [otpHash, Date.now() + INVITE_TTL_MS, inv.id]
  );
  return sendOk(res, { email: inv.email, acceptUrl: buildAcceptUrl(inv.email, otp), code: otp });
}));

module.exports = router;
