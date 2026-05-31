// ============================================================
//  Rutas de equipo / RBAC (Fase 3) — base /api/team
//  Invitaciones con OTP, aceptación, gestión de roles y miembros.
// ============================================================
const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { z } = require('zod');

const { asyncHandler, AppError, sendOk } = require('../lib/apiResponse');
const { withTransaction } = require('../db/mysql');
const { signSession, setSessionCookie } = require('../lib/jwt');
const { sendOtp } = require('../lib/mailer');
const rl = require('../lib/rateLimit');
const { requireSession, requireRole } = require('../middleware/authJwt');
const userRepo = require('../db/repos/userRepo');
const memberRepo = require('../db/repos/memberRepo');
const invitationRepo = require('../db/repos/invitationRepo');
const assignmentRepo = require('../db/repos/assignmentRepo');
const memberWgRepo = require('../db/repos/memberWgRepo');
const { generateKeyPair, buildClientConf } = require('../lib/wgkeys');
const { encrypt, decrypt } = require('../lib/crypto');
const { connectToMikrotik, safeWrite, writeIdempotent, getErrorMessage } = require('../routeros.service');

const isModeratorRole = (role) => role === 'OWNER' || role === 'CO_MODERATOR';

const router = express.Router();

const INVITE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const INVITE_MAX_ATTEMPTS = 5;

const emailSchema = z.string().email('Email inválido').max(255);
const inviteSchema = z.object({ email: emailSchema, role: z.enum(['MEMBER', 'CO_MODERATOR']).default('MEMBER') });
const acceptSchema = z.object({
  email: emailSchema,
  otp: z.string().regex(/^\d{6}$/, 'OTP de 6 dígitos'),
  password: z.string().min(8).max(128).optional(),
  name: z.string().max(120).optional(),
});
const roleSchema = z.object({ userId: z.string().min(1), role: z.enum(['MEMBER', 'CO_MODERATOR']) });

const genOtp = () => String(crypto.randomInt(100000, 1000000));

// ── POST /invite  (OWNER, CO_MODERATOR) ──────────────────────
router.post('/invite', requireSession, requireRole('OWNER', 'CO_MODERATOR'),
  asyncHandler(async (req, res) => {
    const { email, role } = inviteSchema.parse(req.body);
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
      id: crypto.randomUUID(), workspaceId: wsId, email,
      otpHash: await bcrypt.hash(otp, 8), role,
      invitedBy: req.account.sub, expiresAt: Date.now() + INVITE_TTL_MS,
    });
    const delivery = await sendOtp(email, otp, 'invitación al workspace');
    return sendOk(res, { message: 'Invitación enviada', role, dev: delivery.dev || undefined }, 201);
  }));

// ── POST /accept  (público, rate-limited) ────────────────────
router.post('/accept', rl.guard('OTP'), asyncHandler(async (req, res) => {
  const { email, otp, password, name } = acceptSchema.parse(req.body);
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
      await tx.query(
        `INSERT INTO users (id, email, password_hash, name, email_verified, created_at, updated_at)
         VALUES (?,?,?,?,1,?,?)`,
        [id, email, await bcrypt.hash(password, 10), name || '', now, now]
      );
      user = { id, email };
    }
    await memberRepo.add(tx, { workspaceId: inv.workspace_id, userId: user.id, role: inv.role, invitedBy: inv.invited_by });
    await invitationRepo.markAccepted(tx, inv.id);
  });

  await rl.recordAttempt(ip, 'OTP', email, true);

  const token = signSession({ sub: user.id, email, workspace_id: inv.workspace_id, role: inv.role });
  setSessionCookie(res, token);
  return sendOk(res, { user: { id: user.id, email, role: inv.role, workspace_id: inv.workspace_id } });
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

// ── DELETE /member/:userId  (OWNER, CO_MODERATOR) ────────────
router.delete('/member/:userId', requireSession, requireRole('OWNER', 'CO_MODERATOR'),
  asyncHandler(async (req, res) => {
    const { userId } = req.params;
    if (userId === req.account.sub) throw new AppError('No puedes removerte a ti mismo', 400, 'SELF_REMOVE');
    const target = await memberRepo.findMembership(req.account.workspace_id, userId);
    if (!target) throw new AppError('El usuario no es miembro', 404, 'NOT_MEMBER');
    if (target.role === 'OWNER') throw new AppError('No se puede remover al propietario', 403, 'OWNER_LOCKED');
    // Un CO_MODERATOR solo puede remover MEMBERs
    if (req.account.role === 'CO_MODERATOR' && target.role !== 'MEMBER') {
      throw new AppError('Permisos insuficientes para remover a este usuario', 403, 'FORBIDDEN');
    }
    await memberRepo.softRemove(req.account.workspace_id, userId);
    return sendOk(res, { message: 'Miembro removido', userId });
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
        `=allowed-address=${nextIp}/32`, `=comment=member:${req.params.id}`]);
      const serverPub = ifaces.find(i => i.name === 'VPN-WG-MGMT')?.['public-key'] || '';
      const listenPort = parseInt(ifaces.find(i => i.name === 'VPN-WG-MGMT')?.['listen-port'] || '0') || 13231;
      const publicIp = cloud?.[0]?.['public-address'] || ip;
      await api.close();

      let conf = null;
      if (mode === 'generate') {
        conf = buildClientConf({
          privateKey: keys.privateKey, address: nextIp,
          serverPublicKey: serverPub, endpoint: `${publicIp}:${listenPort}`,
          allowedIps: '192.168.21.0/24',
        });
      }
      await memberWgRepo.upsert({
        workspaceId: req.account.workspace_id, userId: req.params.id,
        peerName: `member:${req.params.id}`, allowedIp: nextIp,
        publicKey: peerPub, configEnc: conf ? encrypt(conf) : null,
      });
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
      conf: row.config_enc ? decrypt(row.config_enc) : null,
    },
  });
}));

module.exports = router;
