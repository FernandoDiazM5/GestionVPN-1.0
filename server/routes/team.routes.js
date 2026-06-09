// ============================================================
//  Rutas de equipo / RBAC (Fase 3) — base /api/team
//  Invitaciones con OTP, aceptación, gestión de roles y miembros.
// ============================================================
const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { z } = require('zod');

const { asyncHandler, AppError, sendOk } = require('../lib/apiResponse');
const { withTransaction, query } = require('../db/mysql');
const { signSession, setSessionCookie } = require('../lib/jwt');
const { sendOtp, sendInvitation } = require('../lib/mailer');
const rl = require('../lib/rateLimit');
const { requireSession, requireRole, invalidateUserCache } = require('../middleware/authJwt');
const userRepo = require('../db/repos/userRepo');
const memberRepo = require('../db/repos/memberRepo');
const invitationRepo = require('../db/repos/invitationRepo');
const assignmentRepo = require('../db/repos/assignmentRepo');
const memberWgRepo = require('../db/repos/memberWgRepo');
const { generateKeyPair, buildClientConf } = require('../lib/wgkeys');
const { encrypt, decrypt } = require('../lib/crypto');
const { connectToMikrotik, safeWrite, writeIdempotent, getErrorMessage } = require('../routeros.service');
const { getAppSetting, decryptPass, getDb } = require('../db.service');
const { removePeersFromRouter } = require('../lib/routerCleanup');
const { setPeersEnabled, removeUserMangles } = require('../lib/routerPeerState');

const isModeratorRole = (role) => role === 'OWNER' || role === 'CO_MODERATOR';

// Credenciales del router core desde app_settings (las rutas públicas/in-app no
// pasan por verifyToken, así que se inyectan aquí). Devuelve null si no hay config.
async function getMikrotik() {
  const ip = await getAppSetting('MT_IP');
  const user = await getAppSetting('MT_USER');
  const passData = await getAppSetting('MT_PASS');
  if (!ip || !user || !passData) return null;
  return { ip, user, pass: decryptPass(passData) };
}

// Sanitiza texto para usar como comment de RouterOS (sin saltos de línea ni
// caracteres que puedan romper el formato API). Trunca para evitar comments
// gigantes en peers (RouterOS aguanta cientos de chars, pero >200 es ruido).
function sanitizeComment(s) {
  return String(s || '').replace(/[\r\n=]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
}

// Construye el comment legible "<Workspace> - <email> - <ROL>". Se usa tanto
// para el peer del router como para mgmt_peer_owners (para que ambos coincidan).
async function buildPeerComment(workspaceId, userId, role) {
  const db = await getDb();
  const row = await db.get(
    `SELECT u.email, w.name AS ws_name
       FROM users u
       JOIN workspaces w ON w.id = ?
      WHERE u.id = ? LIMIT 1`,
    [workspaceId, userId]
  );
  const email = row?.email || `user:${userId.slice(0, 8)}`;
  const ws = row?.ws_name || `ws:${workspaceId.slice(0, 8)}`;
  return sanitizeComment(`${ws} - ${email} - ${role || 'MEMBER'}`);
}

// Crea el peer WireGuard del miembro en el router usando SU clave pública
// (la clave privada nunca llega al servidor) y guarda la referencia. Devuelve
// los datos del servidor para que el invitado complete su .conf en el dispositivo.
async function provisionMemberWgByPublicKey(mikrotik, { workspaceId, userId, publicKey, role }) {
  const { ip, user, pass } = mikrotik;
  const peerComment = await buildPeerComment(workspaceId, userId, role);
  let api;
  try {
    api = await connectToMikrotik(ip, user, pass);
    const peers = await safeWrite(api, ['/interface/wireguard/peers/print']);
    const ifaces = await safeWrite(api, ['/interface/wireguard/print']).catch(() => []);
    const cloud = await safeWrite(api, ['/ip/cloud/print']).catch(() => []);
    const mgmt = peers.filter(p => p.interface === 'VPN-WG-MGMT');
    // Reutiliza el peer si ya existe esa clave pública (idempotente)
    const existing = mgmt.find(p => p['public-key'] === publicKey);
    let nextIp;
    if (existing) {
      nextIp = (existing['allowed-address'] || '').split('/')[0];
      // Actualizar el comment si quedó como el formato viejo "member:<uuid>"
      if (existing.comment !== peerComment) {
        try {
          await safeWrite(api, ['/interface/wireguard/peers/set',
            `=.id=${existing['.id']}`, `=comment=${peerComment}`]);
        } catch (_) { /* noop: actualizar comment es best-effort */ }
      }
    } else {
      const used = mgmt.map(p => (p['allowed-address'] || '').split('/')[0])
        .filter(a => a.startsWith('192.168.21.')).map(a => parseInt(a.split('.')[3])).filter(n => !isNaN(n));
      nextIp = `192.168.21.${(used.length ? Math.max(...used) : 19) + 1}`;
      await writeIdempotent(api, ['/interface/wireguard/peers/add',
        '=interface=VPN-WG-MGMT', `=public-key=${publicKey}`,
        `=allowed-address=${nextIp}/32`, `=comment=${peerComment}`]);
    }
    const mgmtIface = ifaces.find(i => i.name === 'VPN-WG-MGMT');
    const serverPub = mgmtIface?.['public-key'] || '';
    const listenPort = parseInt(mgmtIface?.['listen-port'] || '0') || 13231;
    // Prioridad para la IP pública del endpoint:
    //   1) ENV WG_PUBLIC_IP (fija — útil cuando el router tiene IP cambiante o NAT)
    //   2) app_settings.server_public_ip (configurable desde la UI por moderador)
    //   3) /ip/cloud/print del router (auto-discovery)
    //   4) MT_IP (último recurso)
    const settingPubIp = await getAppSetting('server_public_ip').catch(() => null);
    const publicIp = (process.env.WG_PUBLIC_IP || settingPubIp || cloud?.[0]?.['public-address'] || ip).trim();
    await api.close();
    const endpoint = `${publicIp}:${listenPort}`;
    await memberWgRepo.upsert({
      workspaceId, userId, peerName: peerComment, allowedIp: nextIp,
      publicKey, serverPublicKey: serverPub, endpoint, configEnc: null,
    });
    // Atribución del peer al workspace (lo que la pantalla "Gestión de Usuarios"
    // usa para listar SOLO los peers del moderador actual). Sin esto, el peer
    // queda como "huérfano" y solo lo ve el admin de plataforma.
    const db = await getDb();
    await db.run(
      `INSERT INTO mgmt_peer_owners (public_key, workspace_id, allowed_address, comment, created_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(public_key) DO UPDATE SET
         workspace_id = excluded.workspace_id,
         allowed_address = excluded.allowed_address,
         comment = excluded.comment`,
      [publicKey, workspaceId, `${nextIp}/32`, peerComment, Date.now()]
    );
    return { allowedIp: nextIp, serverPublicKey: serverPub, endpoint, allowedIps: '192.168.21.0/24' };
  } catch (e) {
    if (api) try { await api.close(); } catch (_) { /* noop */ }
    throw e;
  }
}

const router = express.Router();

const INVITE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const INVITE_MAX_ATTEMPTS = 5;

const emailSchema = z.string().email('Email inválido').max(255);
const inviteSchema = z.object({
  email: emailSchema,
  name: z.string().max(120).optional(),       // nombre del invitado (lo conoce quien invita)
  role: z.enum(['MEMBER', 'CO_MODERATOR']).default('MEMBER'),
  tunnelId: z.string().max(160).optional(),   // túnel a asignar al aceptar
});
const acceptSchema = z.object({
  email: emailSchema,
  otp: z.string().regex(/^\d{6}$/, 'OTP de 6 dígitos'),
  password: z.string().min(8).max(128).optional(),
  publicKey: z.string().max(120).optional(),  // clave pública WG del invitado (su privada NO se envía)
});
const roleSchema = z.object({ userId: z.string().min(1), role: z.enum(['MEMBER', 'CO_MODERATOR']) });

const genOtp = () => String(crypto.randomInt(100000, 1000000));

// ── POST /invite  (OWNER, CO_MODERATOR) ──────────────────────
router.post('/invite', requireSession, requireRole('OWNER', 'CO_MODERATOR'),
  asyncHandler(async (req, res) => {
    const { email, name, role, tunnelId } = inviteSchema.parse(req.body);
    const wsId = req.account.workspace_id;

    // Un CO_MODERATOR no puede crear otros CO_MODERATOR (solo el OWNER)
    if (role === 'CO_MODERATOR' && req.account.role !== 'OWNER') {
      throw new AppError('Solo el moderador principal puede asignar co-moderadores', 403, 'FORBIDDEN');
    }

    // ¿Ya es miembro?
    const existingUser = await userRepo.findByEmail(email);
    if (existingUser && await memberRepo.findMembership(wsId, existingUser.id)) {
      throw new AppError('Ese usuario ya es miembro del workspace', 409, 'ALREADY_MEMBER');
    }
    // ¿Ya hay invitación pendiente?
    if (await invitationRepo.findPending(wsId, email)) {
      throw new AppError('Ya existe una invitación pendiente para ese email', 409, 'INVITE_PENDING');
    }

    const otp = genOtp();
    await invitationRepo.create({
      id: crypto.randomUUID(), workspaceId: wsId, email, name: name?.trim() || null,
      otpHash: await bcrypt.hash(otp, 8), role, tunnelId: tunnelId || null,
      invitedBy: req.account.sub, expiresAt: Date.now() + INVITE_TTL_MS,
    });

    // Datos para el correo: nombre del workspace y del invitador
    const ctx = (await query(
      `SELECT w.name AS ws_name, u.name AS inviter_name, u.email AS inviter_email
         FROM workspaces w
         JOIN users u ON u.id = ?
        WHERE w.id = ? LIMIT 1`,
      [req.account.sub, wsId]
    ))[0] || {};

    // El envío de correo NO debe bloquear/romper la creación de la invitación:
    // si SMTP está mal configurado o falla, devolvemos la invitación creada
    // pero con un warning para que el moderador sepa que el email no salió.
    let delivery = { dev: true, delivered: false };
    let mailError = null;
    try {
      delivery = await sendInvitation({
        email,
        code: otp,
        inviterName: ctx.inviter_name || ctx.inviter_email || 'El administrador',
        workspaceName: ctx.ws_name || 'tu workspace',
        tunnelId: tunnelId || null,
        role,
      });
    } catch (e) {
      mailError = e.message || 'No se pudo enviar el correo';
      console.warn('[team/invite] sendInvitation falló:', mailError);
    }

    return sendOk(res, {
      message: 'Invitación enviada',
      role, tunnelId: tunnelId || null,
      dev: delivery.dev || undefined,
      mailError: mailError || undefined,
    }, 201);
  }));

// ── POST /accept  (público, rate-limited) ────────────────────
router.post('/accept', rl.guard('OTP'), asyncHandler(async (req, res) => {
  const { email, otp, password, publicKey } = acceptSchema.parse(req.body);
  const ip = req._clientIp;

  const inv = await invitationRepo.findPendingByEmail(email);
  if (!inv) { await rl.recordAttempt(ip, 'OTP', email, false); throw new AppError('Invitación no encontrada', 404, 'NO_INVITE'); }
  if (Date.now() > Number(inv.expires_at)) throw new AppError('La invitación expiró', 410, 'INVITE_EXPIRED');
  if (inv.attempts >= INVITE_MAX_ATTEMPTS) throw new AppError('Demasiados intentos', 429, 'INVITE_LOCKED');

  const okOtp = await bcrypt.compare(otp, inv.otp_hash);
  if (!okOtp) {
    await invitationRepo.incAttempts(inv.id);
    await rl.recordAttempt(ip, 'OTP', email, false);
    throw new AppError('Código incorrecto', 401, 'OTP_INVALID');
  }

  // Usuario existente o nuevo
  let user = await userRepo.findByEmail(email);
  if (!user) {
    if (!password) throw new AppError('Define una contraseña para crear tu cuenta', 400, 'PASSWORD_REQUIRED');
  }

  await withTransaction(async (tx) => {
    if (!user) {
      const id = crypto.randomUUID();
      const now = Date.now();
      // El nombre lo escribió quien invitó (admin/moderador); va en inv.name.
      await tx.query(
        `INSERT INTO users (id, email, password_hash, name, email_verified, created_at, updated_at)
         VALUES (?,?,?,?,1,?,?)`,
        [id, email, await bcrypt.hash(password, 10), inv.name || '', now, now]
      );
      user = { id, email };
    }
    await memberRepo.add(tx, { workspaceId: inv.workspace_id, userId: user.id, role: inv.role, invitedBy: inv.invited_by });
    // Si la invitación es OWNER (alta de moderador), reasignar el owner del
    // workspace al nuevo usuario (durante la invitación el owner_id era el
    // platform_admin como placeholder, ya que esa columna es NOT NULL).
    if (inv.role === 'OWNER') {
      await tx.query(
        'UPDATE workspaces SET owner_id = ?, updated_at = ? WHERE id = ?',
        [user.id, Date.now(), inv.workspace_id]
      );
    }
    // Asigna el túnel adjuntado en la invitación (si lo hay)
    if (inv.tunnel_id) {
      await assignmentRepo.add(tx, {
        workspaceId: inv.workspace_id, tunnelId: inv.tunnel_id, userId: user.id, assignedBy: inv.invited_by,
      });
    }
    await invitationRepo.markAccepted(tx, inv.id);
  });

  await rl.recordAttempt(ip, 'OTP', email, true);

  // Provisión WireGuard: si el invitado no envía su clave pública, el servidor
  // genera el par y devuelve el .conf completo (PrivateKey real) listo para usar.
  // Si la envía, solo registra su peer (modo seguro: la clave privada nunca sale).
  let wireguard = null;
  let conf = null;
  const mt = await getMikrotik();
  if (mt) {
    try {
      const generated = publicKey ? null : generateKeyPair();
      const pub = publicKey || generated.publicKey;
      wireguard = await provisionMemberWgByPublicKey(mt, {
        workspaceId: inv.workspace_id, userId: user.id, publicKey: pub, role: inv.role,
      });
      if (generated) {
        conf = buildClientConf({
          privateKey: generated.privateKey,
          address: wireguard.allowedIp,
          serverPublicKey: wireguard.serverPublicKey,
          endpoint: wireguard.endpoint,
          allowedIps: '0.0.0.0/0',
        });
        // Persistir el .conf cifrado para que el moderador pueda re-mostrarlo
        // luego (botón "Config WG" en Gestión de Usuarios). Si el invitado
        // pega su propia publicKey, no hay conf que guardar (privada NO viaja).
        await memberWgRepo.updateConfig({
          workspaceId: inv.workspace_id, userId: user.id, configEnc: encrypt(conf),
        });
      }
    } catch (e) {
      console.warn('[team/accept] WG no provisionado (router):', e.message);
    }
  }

  const token = signSession({ sub: user.id, email, workspace_id: inv.workspace_id, role: inv.role });
  setSessionCookie(res, token);
  return sendOk(res, {
    user: { id: user.id, email, role: inv.role, workspace_id: inv.workspace_id },
    tunnel: inv.tunnel_id || null,
    wireguard,   // { allowedIp, serverPublicKey, endpoint, allowedIps } o null
    conf,        // contenido completo del .conf con PrivateKey real, o null si el invitado proveyó su publicKey
  });
}));

// ── GET /my-invitations — invitaciones PENDING para el usuario logueado ──
router.get('/my-invitations', requireSession, asyncHandler(async (req, res) => {
  const invitations = await invitationRepo.listPendingForEmail(req.account.email);
  return sendOk(res, { invitations });
}));

// ── POST /invitations/:id/accept — aceptar EN LA APP (usuario logueado) ──
//  Reemplaza al OTP: el usuario ya autenticado acepta y envía su clave pública WG.
const inAppAcceptSchema = z.object({ publicKey: z.string().max(120).optional() });
router.post('/invitations/:id/accept', requireSession, asyncHandler(async (req, res) => {
  const { publicKey } = inAppAcceptSchema.parse(req.body);
  const inv = await invitationRepo.findById(req.params.id);
  if (!inv || inv.status !== 'PENDING') throw new AppError('Invitación no encontrada', 404, 'NO_INVITE');
  if (Date.now() > Number(inv.expires_at)) throw new AppError('La invitación expiró', 410, 'INVITE_EXPIRED');
  if (String(inv.email).toLowerCase() !== String(req.account.email || '').toLowerCase()) {
    throw new AppError('Esta invitación no es para tu cuenta', 403, 'FORBIDDEN');
  }
  const userId = req.account.sub;

  await withTransaction(async (tx) => {
    const existing = await memberRepo.findMembership(inv.workspace_id, userId);
    if (!existing) {
      await memberRepo.add(tx, { workspaceId: inv.workspace_id, userId, role: inv.role, invitedBy: inv.invited_by });
    }
    if (inv.tunnel_id) {
      await assignmentRepo.add(tx, {
        workspaceId: inv.workspace_id, tunnelId: inv.tunnel_id, userId, assignedBy: inv.invited_by,
      });
    }
    await invitationRepo.markAccepted(tx, inv.id);
  });

  let wireguard = null;
  if (publicKey) {
    const mt = await getMikrotik();
    if (mt) {
      try { wireguard = await provisionMemberWgByPublicKey(mt, { workspaceId: inv.workspace_id, userId, publicKey, role: inv.role }); }
      catch (e) { console.warn('[team/accept-in-app] WG no provisionado:', e.message); }
    }
  }

  // Cambia la sesión al workspace recién aceptado
  const token = signSession({ sub: userId, email: req.account.email, workspace_id: inv.workspace_id, role: inv.role });
  setSessionCookie(res, token);
  return sendOk(res, {
    user: { id: userId, email: req.account.email, role: inv.role, workspace_id: inv.workspace_id },
    tunnel: inv.tunnel_id || null,
    wireguard,
  });
}));

// ── GET /members  (cualquier miembro) ────────────────────────
router.get('/members', requireSession, asyncHandler(async (req, res) => {
  const members = await memberRepo.listMembers(req.account.workspace_id);
  return sendOk(res, { members });
}));

// ── GET /invitations  (OWNER, CO_MODERATOR) ──────────────────
router.get('/invitations', requireSession, requireRole('OWNER', 'CO_MODERATOR'),
  asyncHandler(async (req, res) => {
    const invitations = await invitationRepo.listPending(req.account.workspace_id);
    return sendOk(res, { invitations });
  }));

// ── POST /role  (solo OWNER) — promover/degradar ─────────────
router.post('/role', requireSession, requireRole('OWNER'),
  asyncHandler(async (req, res) => {
    const { userId, role } = roleSchema.parse(req.body);
    if (userId === req.account.sub) throw new AppError('No puedes cambiar tu propio rol', 400, 'SELF_ROLE');
    const target = await memberRepo.findMembership(req.account.workspace_id, userId);
    if (!target) throw new AppError('El usuario no es miembro', 404, 'NOT_MEMBER');
    if (target.role === 'OWNER') throw new AppError('No se puede cambiar el rol del propietario', 403, 'OWNER_LOCKED');
    const ok = await memberRepo.updateRole(req.account.workspace_id, userId, role);
    if (!ok) throw new AppError('No se pudo actualizar el rol', 400, 'ROLE_UPDATE_FAILED');
    return sendOk(res, { message: 'Rol actualizado', userId, role });
  }));

// ── PATCH /member/:userId  (OWNER, CO_MODERATOR) — habilitar/deshabilitar ──
//  Suspende sin borrar: pone disabled_at, sincroniza =disabled= en el peer WG
//  del MikroTik, cierra la sesión activa del usuario e invalida su cache de auth.
//  Al rehabilitar, solo limpia disabled_at + re-habilita el peer.
const memberPatchSchema = z.object({
  disabled: z.boolean(),
}).refine(d => Object.keys(d).length > 0, { message: 'Nada que actualizar' });

router.patch('/member/:userId', requireSession, requireRole('OWNER', 'CO_MODERATOR'),
  asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const wsId = req.account.workspace_id;
    const { disabled } = memberPatchSchema.parse(req.body);

    if (userId === req.account.sub) {
      throw new AppError('No puedes cambiar tu propio estado', 400, 'SELF_DISABLE');
    }
    const target = await memberRepo.findMembership(wsId, userId);
    if (!target) throw new AppError('El usuario no es miembro', 404, 'NOT_MEMBER');
    if (target.role === 'OWNER') throw new AppError('No se puede deshabilitar al propietario', 403, 'OWNER_LOCKED');
    if (req.account.role === 'CO_MODERATOR' && target.role !== 'MEMBER') {
      throw new AppError('Permisos insuficientes', 403, 'FORBIDDEN');
    }

    const now = Date.now();
    const db = await getDb();

    // 1) Estado en BD
    await db.run(
      'UPDATE users SET disabled_at = ?, updated_at = ? WHERE id = ?',
      [disabled ? now : null, now, userId]
    );

    // 2) Sync peer WG del miembro en el router (best-effort)
    const wgRows = await db.all(
      'SELECT public_key FROM member_wireguard WHERE workspace_id = ? AND user_id = ? AND public_key IS NOT NULL',
      [wsId, userId]
    );
    const publicKeys = wgRows.map(r => r.public_key);
    const routerSync = await setPeersEnabled(publicKeys, !disabled);

    // 3) Si deshabilitamos: borrar mangle activo del usuario + cerrar sesión + invalidar cache
    let mangleCleanup = null;
    if (disabled) {
      // Borrar la regla mangle del usuario del router (corte inmediato de acceso)
      mangleCleanup = await removeUserMangles([userId]);
      // Cerrar sesión activa en BD
      await db.run(
        `UPDATE tunnel_user_sessions
            SET status = 'CLOSED', deactivated_at = ?
          WHERE workspace_id = ? AND user_id = ? AND status = 'ACTIVE'`,
        [now, wsId, userId]
      );
      invalidateUserCache(userId);
    }

    return sendOk(res, {
      message: disabled ? 'Miembro deshabilitado' : 'Miembro habilitado',
      userId,
      disabled,
      router: routerSync,
      mangle: mangleCleanup || undefined,
    });
  }));

// ── DELETE /member/:userId  (OWNER, CO_MODERATOR) ────────────
//  HARD DELETE en cascada: peer WG del router + member_wireguard +
//  mgmt_peer_owners + tunnel_assignments + user_mgmt_ips + sesiones +
//  workspace_members. El user se borra solo si no pertenece a otros ws.
router.delete('/member/:userId', requireSession, requireRole('OWNER', 'CO_MODERATOR'),
  asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const wsId = req.account.workspace_id;
    if (userId === req.account.sub) throw new AppError('No puedes removerte a ti mismo', 400, 'SELF_REMOVE');
    const target = await memberRepo.findMembership(wsId, userId);
    if (!target) throw new AppError('El usuario no es miembro', 404, 'NOT_MEMBER');
    if (target.role === 'OWNER') throw new AppError('No se puede remover al propietario', 403, 'OWNER_LOCKED');
    // Un CO_MODERATOR solo puede remover MEMBERs
    if (req.account.role === 'CO_MODERATOR' && target.role !== 'MEMBER') {
      throw new AppError('Permisos insuficientes para remover a este usuario', 403, 'FORBIDDEN');
    }

    // 1) Recolectar las public-keys WG del miembro para limpiar el router.
    //    Antes filtrábamos mgmt_peer_owners por comment="member:<userId>";
    //    ahora con comments legibles ese match ya no aplica. Usamos
    //    member_wireguard (tiene user_id directo) como fuente única de verdad.
    const db = await getDb();
    const wgRows = await db.all(
      'SELECT public_key FROM member_wireguard WHERE workspace_id = ? AND user_id = ?',
      [wsId, userId]
    );
    const publicKeys = [...new Set(wgRows.map(r => r.public_key).filter(Boolean))];

    // 2a) Eliminar peers del MikroTik (best-effort)
    const routerCleanup = await removePeersFromRouter(publicKeys);
    // 2b) Eliminar mangle activo del usuario (no dejar regla huérfana)
    const mangleCleanup = await removeUserMangles([userId]);

    // 3) Hard-delete en BD dentro de transacción
    await withTransaction(async (tx) => {
      if (publicKeys.length) {
        const ph = publicKeys.map(() => '?').join(',');
        await tx.query(`DELETE FROM mgmt_peer_owners WHERE public_key IN (${ph})`, publicKeys);
      }
      await tx.query('DELETE FROM member_wireguard WHERE workspace_id = ? AND user_id = ?', [wsId, userId]);
      await tx.query('DELETE FROM tunnel_assignments WHERE workspace_id = ? AND user_id = ?', [wsId, userId]);
      await tx.query('DELETE FROM user_mgmt_ips WHERE workspace_id = ? AND user_id = ?', [wsId, userId]);
      await tx.query('DELETE FROM tunnel_user_sessions WHERE workspace_id = ? AND user_id = ?', [wsId, userId]);
      await tx.query('DELETE FROM tunnel_session_logs WHERE workspace_id = ? AND user_id = ?', [wsId, userId]);
      await tx.query('DELETE FROM workspace_members WHERE workspace_id = ? AND user_id = ?', [wsId, userId]);

      // Eliminar el user solo si no es miembro de otros workspaces
      const otherWs = await tx.query('SELECT 1 FROM workspace_members WHERE user_id = ? LIMIT 1', [userId]);
      if (!otherWs.length) {
        await tx.query('DELETE FROM users WHERE id = ?', [userId]);
        // Invalida el cache de auth → próximo request del user dará 401
        invalidateUserCache(userId);
      }
    });

    return sendOk(res, {
      message: 'Miembro eliminado completamente',
      userId,
      router: routerCleanup, // peers WG: { removed, failed, skipped }
      mangle: mangleCleanup, // reglas mangle: { removed, failed, skipped }
    });
  }));

// ── POST /invitation/:id/revoke  (OWNER, CO_MODERATOR) ───────
router.post('/invitation/:id/revoke', requireSession, requireRole('OWNER', 'CO_MODERATOR'),
  asyncHandler(async (req, res) => {
    const ok = await invitationRepo.revoke(req.params.id, req.account.workspace_id);
    if (!ok) throw new AppError('Invitación no encontrada o ya procesada', 404, 'NO_INVITE');
    return sendOk(res, { message: 'Invitación revocada' });
  }));

// ── GET /assignments — asignaciones de túneles ──────────────
//  Moderador (OWNER/CO_MOD): todas las del workspace.
//  View (MEMBER): solo las suyas.
router.get('/assignments', requireSession, asyncHandler(async (req, res) => {
  const wsId = req.account.workspace_id;
  if (isModeratorRole(req.account.role)) {
    return sendOk(res, { assignments: await assignmentRepo.listForWorkspace(wsId) });
  }
  return sendOk(res, { assignments: await assignmentRepo.listByUser(wsId, req.account.sub) });
}));

// ── POST /assignments — asignar túnel a miembro (Moderador) ──
router.post('/assignments', requireSession, requireRole('OWNER', 'CO_MODERATOR'),
  asyncHandler(async (req, res) => {
    const { userId, tunnelId } = z.object({
      userId: z.string().min(1), tunnelId: z.string().min(1).max(160),
    }).parse(req.body);
    const member = await memberRepo.findMembership(req.account.workspace_id, userId);
    if (!member) throw new AppError('El usuario no es miembro del workspace', 404, 'NOT_MEMBER');
    await assignmentRepo.add(null, {
      workspaceId: req.account.workspace_id, tunnelId, userId, assignedBy: req.account.sub,
    });
    return sendOk(res, { message: 'Túnel asignado', userId, tunnelId }, 201);
  }));

// ── DELETE /assignments/:id — quitar asignación (Moderador) ──
router.delete('/assignments/:id', requireSession, requireRole('OWNER', 'CO_MODERATOR'),
  asyncHandler(async (req, res) => {
    const ok = await assignmentRepo.remove(req.params.id, req.account.workspace_id);
    if (!ok) throw new AppError('Asignación no encontrada', 404, 'NOT_FOUND');
    return sendOk(res, { message: 'Asignación eliminada' });
  }));

// ── POST /member/:id/wireguard — provisiona acceso WG al miembro ──
//  El Moderador genera el peer WireGuard (en MikroTik) para el equipo del
//  miembro (móvil/PC) y guarda su .conf cifrado. Devuelve el .conf una vez.
const wgSchema = z.object({
  mode: z.enum(['generate', 'publicKey']).default('generate'),
  publicKey: z.string().max(120).optional(),
});
router.post('/member/:id/wireguard', requireSession, requireRole('OWNER', 'CO_MODERATOR'),
  asyncHandler(async (req, res) => {
    if (!req.mikrotik) throw new AppError('Configura el router MikroTik en Ajustes', 503, 'NO_ROUTER');
    const { mode, publicKey } = wgSchema.parse(req.body);
    const member = await memberRepo.findMembership(req.account.workspace_id, req.params.id);
    if (!member) throw new AppError('El usuario no es miembro', 404, 'NOT_MEMBER');
    if (mode === 'publicKey' && !publicKey) throw new AppError('Falta la clave pública', 400, 'NO_PUBKEY');

    const keys = mode === 'generate' ? generateKeyPair() : null;
    const peerPub = mode === 'generate' ? keys.publicKey : publicKey;
    const peerComment = await buildPeerComment(req.account.workspace_id, req.params.id, member.role);

    const { ip, user, pass } = req.mikrotik;
    let api;
    try {
      api = await connectToMikrotik(ip, user, pass);
      const peers = await safeWrite(api, ['/interface/wireguard/peers/print']);
      const ifaces = await safeWrite(api, ['/interface/wireguard/print']).catch(() => []);
      const cloud = await safeWrite(api, ['/ip/cloud/print']).catch(() => []);
      const mgmt = peers.filter(p => p.interface === 'VPN-WG-MGMT');
      const used = mgmt.map(p => (p['allowed-address'] || '').split('/')[0])
        .filter(a => a.startsWith('192.168.21.')).map(a => parseInt(a.split('.')[3])).filter(n => !isNaN(n));
      const nextIp = `192.168.21.${(used.length ? Math.max(...used) : 19) + 1}`;
      await writeIdempotent(api, ['/interface/wireguard/peers/add',
        '=interface=VPN-WG-MGMT', `=public-key=${peerPub}`,
        `=allowed-address=${nextIp}/32`, `=comment=${peerComment}`]);
      const serverPub = ifaces.find(i => i.name === 'VPN-WG-MGMT')?.['public-key'] || '';
      const listenPort = parseInt(ifaces.find(i => i.name === 'VPN-WG-MGMT')?.['listen-port'] || '0') || 13231;
      // Misma jerarquía que provisionMemberWgByPublicKey (ENV → setting → cloud → MT_IP)
      const settingPubIp = await getAppSetting('server_public_ip').catch(() => null);
      const publicIp = (process.env.WG_PUBLIC_IP || settingPubIp || cloud?.[0]?.['public-address'] || ip).trim();
      await api.close();

      let conf = null;
      if (mode === 'generate') {
        conf = buildClientConf({
          privateKey: keys.privateKey, address: nextIp,
          serverPublicKey: serverPub, endpoint: `${publicIp}:${listenPort}`,
          allowedIps: '0.0.0.0/0',
        });
      }
      await memberWgRepo.upsert({
        workspaceId: req.account.workspace_id, userId: req.params.id,
        peerName: peerComment, allowedIp: nextIp,
        publicKey: peerPub, serverPublicKey: serverPub, endpoint: `${publicIp}:${listenPort}`,
        configEnc: conf ? encrypt(conf) : null,
      });
      // Atribución multi-tenant para "Gestión de Usuarios"
      const db = await getDb();
      await db.run(
        `INSERT INTO mgmt_peer_owners (public_key, workspace_id, allowed_address, comment, created_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(public_key) DO UPDATE SET
           workspace_id = excluded.workspace_id,
           allowed_address = excluded.allowed_address,
           comment = excluded.comment`,
        [peerPub, req.account.workspace_id, `${nextIp}/32`, peerComment, Date.now()]
      );
      return sendOk(res, { allowedIp: nextIp, publicKey: peerPub, conf }, 201);
    } catch (error) {
      if (api) try { await api.close(); } catch (_) { }
      throw new AppError(getErrorMessage(error, ip, user), 502, 'ROUTER_ERROR');
    }
  }));

// ── GET /member/:id/wireguard — config del miembro (él o un moderador) ──
router.get('/member/:id/wireguard', requireSession, asyncHandler(async (req, res) => {
  const targetId = req.params.id === 'me' ? req.account.sub : req.params.id;
  if (targetId !== req.account.sub && !isModeratorRole(req.account.role)) {
    throw new AppError('Permisos insuficientes', 403, 'FORBIDDEN');
  }
  const row = await memberWgRepo.getByUser(req.account.workspace_id, targetId);
  if (!row) throw new AppError('Sin acceso WireGuard configurado', 404, 'NO_WG');
  return sendOk(res, {
    wireguard: {
      allowedIp: row.allowed_ip, publicKey: row.public_key,
      serverPublicKey: row.server_public_key || null,
      endpoint: row.endpoint || null,
      allowedIps: '192.168.21.0/24',
      conf: row.config_enc ? decrypt(row.config_enc) : null,
    },
  });
}));

// ── GET /wireguard/by-key/:publicKey — Config completa por clave pública ──
//  Devuelve la conf descifrada del peer, restringida al workspace del moderador.
//  Usado por la tabla "Gestión de Usuarios" para mostrar la conf en un modal.
router.get('/wireguard/by-key/:publicKey', requireSession, requireRole('OWNER', 'CO_MODERATOR'),
  asyncHandler(async (req, res) => {
    const row = await memberWgRepo.getByPublicKey(req.account.workspace_id, req.params.publicKey);
    if (!row) throw new AppError('Peer no encontrado en este workspace', 404, 'NO_WG');
    return sendOk(res, {
      wireguard: {
        allowedIp: row.allowed_ip,
        publicKey: row.public_key,
        serverPublicKey: row.server_public_key || null,
        endpoint: row.endpoint || null,
        allowedIps: '0.0.0.0/0',
        peerName: row.peer_name,
        conf: row.config_enc ? decrypt(row.config_enc) : null,
      },
    });
  }));

module.exports = router;
