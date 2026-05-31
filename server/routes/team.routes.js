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

module.exports = router;
