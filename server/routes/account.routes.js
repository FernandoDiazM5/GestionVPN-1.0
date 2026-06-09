// ============================================================
//  Rutas de cuenta multi-tenant (Fase 2)
//  Registro con verificación OTP, login, logout y sesión.
//  Convive con /api/auth (legacy) sin interferir. Base: /api/account
// ============================================================
const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { z } = require('zod');

const { asyncHandler, AppError, sendOk } = require('../lib/apiResponse');
const { withTransaction } = require('../db/mysql');
const { signSession, setSessionCookie, clearSessionCookie } = require('../lib/jwt');
const { sendOtp } = require('../lib/mailer');
const rl = require('../lib/rateLimit');
const userRepo = require('../db/repos/userRepo');
const workspaceRepo = require('../db/repos/workspaceRepo');
const { requireSession, invalidateUserCache } = require('../middleware/authJwt');
const { query } = require('../db/mysql');
const { verifyToken } = require('../auth.middleware');
const { buildSessionForLegacyUser } = require('../lib/sessionBridge');

const router = express.Router();

const OTP_TTL_MS = 10 * 60 * 1000;   // 10 min
const OTP_MAX_ATTEMPTS = 5;

const emailSchema = z.string().email('Email inválido').max(255);
const registerSchema = z.object({
  email: emailSchema,
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres').max(128),
  name: z.string().max(120).optional(),
});
const verifySchema = z.object({ email: emailSchema, otp: z.string().regex(/^\d{6}$/, 'OTP de 6 dígitos') });
const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(128) });

function genOtp() {
  return String(crypto.randomInt(100000, 1000000)); // 6 dígitos
}

// ── POST /register ───────────────────────────────────────────
router.post('/register', asyncHandler(async (req, res) => {
  const { email, password, name } = registerSchema.parse(req.body);

  const existing = await userRepo.findByEmail(email);
  if (existing && existing.email_verified) {
    throw new AppError('Ese email ya está registrado', 409, 'EMAIL_TAKEN');
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const otp = genOtp();
  const otpHash = await bcrypt.hash(otp, 8);
  const otpExpiresAt = Date.now() + OTP_TTL_MS;

  if (existing && !existing.email_verified) {
    // Re-registro de un email no verificado → refresca credenciales + OTP
    await userRepo.setOtp(existing.id, otpHash, otpExpiresAt);
  } else {
    await userRepo.createPending({
      id: crypto.randomUUID(), email, passwordHash, name, otpHash, otpExpiresAt,
    });
  }

  const delivery = await sendOtp(email, otp, 'verificación de cuenta');
  return sendOk(res, {
    message: 'Código de verificación enviado',
    // En dev (sin SMTP) devolvemos una pista para facilitar la prueba
    dev: delivery.dev || undefined,
  }, 201);
}));

// ── POST /verify ─────────────────────────────────────────────
router.post('/verify', rl.guard('OTP'), asyncHandler(async (req, res) => {
  const { email, otp } = verifySchema.parse(req.body);
  const ip = req._clientIp;

  const user = await userRepo.findByEmail(email);
  if (!user || user.email_verified) {
    await rl.recordAttempt(ip, 'OTP', email, false);
    throw new AppError('Solicitud inválida', 400, 'INVALID');
  }
  if (!user.otp_hash || !user.otp_expires_at || Date.now() > Number(user.otp_expires_at)) {
    throw new AppError('El código expiró, solicita uno nuevo', 410, 'OTP_EXPIRED');
  }
  if (user.otp_attempts >= OTP_MAX_ATTEMPTS) {
    throw new AppError('Demasiados intentos, solicita un código nuevo', 429, 'OTP_LOCKED');
  }

  const okOtp = await bcrypt.compare(otp, user.otp_hash);
  if (!okOtp) {
    await userRepo.incOtpAttempts(user.id);
    await rl.recordAttempt(ip, 'OTP', email, false);
    throw new AppError('Código incorrecto', 401, 'OTP_INVALID');
  }

  // Éxito: verificar + crear workspace + membresía OWNER (TRANSACCIÓN ACID)
  const { workspaceId } = await withTransaction(async (tx) => {
    await tx.query(
      'UPDATE users SET email_verified = 1, otp_hash = NULL, otp_expires_at = NULL, updated_at = ? WHERE id = ?',
      [Date.now(), user.id]
    );
    return workspaceRepo.createForOwner(tx, {
      ownerId: user.id,
      name: (user.name && `Espacio de ${user.name}`) || 'Mi espacio de trabajo',
    });
  });

  await rl.recordAttempt(ip, 'OTP', email, true);

  const token = signSession({ sub: user.id, email: user.email, workspace_id: workspaceId, role: 'OWNER' });
  setSessionCookie(res, token);
  return sendOk(res, { user: { id: user.id, email: user.email, role: 'OWNER', workspace_id: workspaceId } });
}));

// ── POST /resend ─────────────────────────────────────────────
router.post('/resend', asyncHandler(async (req, res) => {
  const { email } = z.object({ email: emailSchema }).parse(req.body);
  const user = await userRepo.findByEmail(email);
  if (!user || user.email_verified) return sendOk(res, { message: 'Si la cuenta existe, se envió un código' });
  const otp = genOtp();
  await userRepo.setOtp(user.id, await bcrypt.hash(otp, 8), Date.now() + OTP_TTL_MS);
  const delivery = await sendOtp(email, otp, 'verificación de cuenta');
  return sendOk(res, { message: 'Código reenviado', dev: delivery.dev || undefined });
}));

// ── POST /login ──────────────────────────────────────────────
router.post('/login', rl.guard('LOGIN'), asyncHandler(async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);
  const ip = req._clientIp;

  const user = await userRepo.findByEmail(email);
  if (!user) {
    await rl.recordAttempt(ip, 'LOGIN', email, false);
    throw new AppError('Credenciales inválidas', 401, 'BAD_CREDENTIALS');
  }
  if (!user.email_verified) {
    throw new AppError('Verifica tu correo antes de iniciar sesión', 403, 'EMAIL_NOT_VERIFIED');
  }
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    await rl.recordAttempt(ip, 'LOGIN', email, false);
    throw new AppError('Credenciales inválidas', 401, 'BAD_CREDENTIALS');
  }

  const membership = await workspaceRepo.findMembershipByUser(user.id);
  if (!membership) throw new AppError('El usuario no pertenece a ningún workspace', 403, 'NO_WORKSPACE');

  await rl.recordAttempt(ip, 'LOGIN', email, true);

  const token = signSession({
    sub: user.id, email: user.email, workspace_id: membership.workspace_id, role: membership.role,
  });
  setSessionCookie(res, token);
  return sendOk(res, {
    user: { id: user.id, email: user.email, name: user.name, role: membership.role, workspace_id: membership.workspace_id },
  });
}));

// ── POST /logout ─────────────────────────────────────────────
router.post('/logout', (req, res) => {
  clearSessionCookie(res);
  return sendOk(res, { message: 'Sesión cerrada' });
});

// ── POST /bridge ─────────────────────────────────────────────
//  Puente desde la sesión legacy (Bearer): crea/recupera el usuario
//  multi-tenant y su workspace, y emite la cookie de sesión. Evita
//  el doble login: si ya estás autenticado en la app, "entras" solo.
router.post('/bridge', verifyToken, asyncHandler(async (req, res) => {
  // Ya hay sesión RBAC (cookie o Bearer RBAC) → reemítela tal cual.
  if (req.account?.sub && req.account?.workspace_id) {
    const u = await userRepo.findById(req.account.sub);
    const token = signSession({
      sub: req.account.sub, email: req.account.email,
      workspace_id: req.account.workspace_id, role: req.account.role,
      platform_admin: !!req.account.platform_admin,
    });
    setSessionCookie(res, token);
    return sendOk(res, {
      user: {
        id: req.account.sub, email: req.account.email, name: u?.name,
        role: req.account.role, workspace_id: req.account.workspace_id,
        platform_admin: !!req.account.platform_admin,
      },
    });
  }
  // Si no, es un usuario legacy → construye la sesión desde su username.
  const legacy = req.user;
  if (!legacy?.username) throw new AppError('Sesión no válida', 401, 'NO_LEGACY');
  const { token, user } = await buildSessionForLegacyUser(legacy.username);
  setSessionCookie(res, token);
  return sendOk(res, { user });
}));

// ── GET /me ──────────────────────────────────────────────────
router.get('/me', requireSession, asyncHandler(async (req, res) => {
  const user = await userRepo.findById(req.account.sub);
  if (!user) throw new AppError('Usuario no encontrado', 404, 'NOT_FOUND');
  return sendOk(res, {
    user: {
      id: user.id, email: user.email, name: user.name,
      role: req.account.role, workspace_id: req.account.workspace_id,
      platform_admin: Number(user.is_platform_admin) === 1,
    },
  });
}));

// ════════════════════════════════════════════════════════════════════════════
//  Ajustes del usuario logueado (Fase C)
// ════════════════════════════════════════════════════════════════════════════

// ── PATCH /password ──────────────────────────────────────────
//  Cambia la contraseña del usuario en sesión. Requiere la actual.
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(8, 'Mínimo 8 caracteres').max(128),
});
router.patch('/password', requireSession, asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
  const user = await userRepo.findById(req.account.sub);
  if (!user) throw new AppError('Usuario no encontrado', 404, 'NOT_FOUND');

  const ok = await bcrypt.compare(currentPassword, user.password_hash);
  if (!ok) throw new AppError('La contraseña actual es incorrecta', 401, 'BAD_CURRENT');

  if (currentPassword === newPassword) {
    throw new AppError('La nueva contraseña debe ser distinta de la actual', 400, 'SAME_PASSWORD');
  }

  const newHash = await bcrypt.hash(newPassword, 10);
  await query('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?',
    [newHash, Date.now(), user.id]);
  // Invalidar cache de auth: cualquier otra sesión existente del usuario
  // quedará en 401 USER_DELETED en su próximo request.
  invalidateUserCache(user.id);

  return sendOk(res, { message: 'Contraseña actualizada' });
}));

// ── PATCH /email/request ─────────────────────────────────────
//  Solicita cambio de correo. Envía OTP al NUEVO email (anti-hijack).
const changeEmailRequestSchema = z.object({
  newEmail: emailSchema,
});
router.patch('/email/request', requireSession, asyncHandler(async (req, res) => {
  const { newEmail } = changeEmailRequestSchema.parse(req.body);
  const lc = newEmail.toLowerCase();

  if (lc === String(req.account.email).toLowerCase()) {
    throw new AppError('El correo nuevo es igual al actual', 400, 'SAME_EMAIL');
  }
  // El email destino no debe estar en uso por otro user activo
  const conflict = await userRepo.findByEmail(lc);
  if (conflict && conflict.id !== req.account.sub) {
    throw new AppError('Ese correo ya está registrado', 409, 'EMAIL_TAKEN');
  }

  // Generar OTP + guardar en otp_hash del usuario actual con TTL 10 min.
  // Reusamos los campos otp_* del propio usuario (no se mezclan con otros flujos:
  // el cambio solo se ejecuta cuando el solicitante presenta este OTP).
  const otp = genOtp();
  const otpHash = await bcrypt.hash(otp, 8);
  await query(
    'UPDATE users SET otp_hash = ?, otp_expires_at = ?, otp_attempts = 0, updated_at = ? WHERE id = ?',
    [otpHash, Date.now() + OTP_TTL_MS, Date.now(), req.account.sub]
  );

  const delivery = await sendOtp(lc, otp, 'cambio de correo');
  return sendOk(res, {
    message: 'Te enviamos un código al nuevo correo para confirmar el cambio',
    dev: delivery.dev || undefined,
  });
}));

// ── POST /email/confirm ──────────────────────────────────────
//  Confirma el cambio: valida OTP + contraseña actual + persiste el email nuevo.
//  Exigimos la contraseña actual como segunda capa (si alguien robó la sesión,
//  igual no puede cambiar el correo sin la contraseña).
const changeEmailConfirmSchema = z.object({
  newEmail: emailSchema,
  otp: z.string().regex(/^\d{6}$/, 'OTP de 6 dígitos'),
  currentPassword: z.string().min(1).max(128),
});
router.post('/email/confirm', requireSession, asyncHandler(async (req, res) => {
  const { newEmail, otp, currentPassword } = changeEmailConfirmSchema.parse(req.body);
  const lc = newEmail.toLowerCase();

  const user = await userRepo.findById(req.account.sub);
  if (!user) throw new AppError('Usuario no encontrado', 404, 'NOT_FOUND');

  const passOk = await bcrypt.compare(currentPassword, user.password_hash);
  if (!passOk) throw new AppError('La contraseña actual es incorrecta', 401, 'BAD_CURRENT');

  if (!user.otp_hash || !user.otp_expires_at || Date.now() > Number(user.otp_expires_at)) {
    throw new AppError('El código expiró, solicita uno nuevo', 410, 'OTP_EXPIRED');
  }
  if (user.otp_attempts >= OTP_MAX_ATTEMPTS) {
    throw new AppError('Demasiados intentos, solicita un código nuevo', 429, 'OTP_LOCKED');
  }
  const otpOk = await bcrypt.compare(otp, user.otp_hash);
  if (!otpOk) {
    await userRepo.incOtpAttempts(user.id);
    throw new AppError('Código incorrecto', 401, 'OTP_INVALID');
  }

  // Re-verificar que el correo no se haya tomado entre el request y el confirm
  const conflict = await userRepo.findByEmail(lc);
  if (conflict && conflict.id !== user.id) {
    throw new AppError('Ese correo ya está registrado', 409, 'EMAIL_TAKEN');
  }

  await query(
    'UPDATE users SET email = ?, otp_hash = NULL, otp_expires_at = NULL, updated_at = ? WHERE id = ?',
    [lc, Date.now(), user.id]
  );
  // Invalidar cache: el JWT viejo lleva el email anterior; en próximas requests
  // el middleware recalculará y el frontend recibirá el nuevo /me.
  invalidateUserCache(user.id);

  return sendOk(res, { message: 'Correo actualizado', email: lc });
}));

module.exports = router;
