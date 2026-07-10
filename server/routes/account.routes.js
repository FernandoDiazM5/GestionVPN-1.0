// ============================================================
//  Rutas de cuenta multi-tenant (Fase 2)
//  Registro con verificación OTP, login, logout y sesión.
//  Convive con /api/auth (legacy) sin interferir. Base: /api/account
// ============================================================
const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const {
  EmailSchema,
  RegisterRequestSchema,
  VerifyRequestSchema,
  ResendRequestSchema,
  AccountLoginRequestSchema,
  ChangePasswordRequestSchema,
  ChangeEmailRequestSchema,
  ChangeEmailConfirmSchema,
  SwitchWorkspaceRequestSchema,
} = require('@gestionvpn/contracts');

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
const { isSyntheticEmail } = require('../lib/localAccount');
const memberRepo = require('../db/repos/memberRepo');
const tunnelService = require('../lib/tunnelService');
const { getAppSetting, decryptPass } = require('../db.service');
const log = require('../lib/logger').child({ scope: 'account' });

const router = express.Router();

const OTP_TTL_MS = 10 * 60 * 1000;   // 10 min
const OTP_MAX_ATTEMPTS = 5;

// Schemas centralizados en @gestionvpn/contracts (F5).
// Aliases locales sin duplicar definiciones — mismo comportamiento Zod.
const emailSchema = EmailSchema;
const registerSchema = RegisterRequestSchema;
const verifySchema = VerifyRequestSchema;
const loginSchema = AccountLoginRequestSchema;

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
  const { email } = ResendRequestSchema.parse(req.body);
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
    const ws = await workspaceRepo.findById(req.account.workspace_id);
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
        workspace_name: ws?.name,
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
  // workspace_name viaja en el header del módulo Workspace unificado;
  // para platform_admin no aplica (no es miembro de un workspace).
  const ws = req.account.workspace_id
    ? await workspaceRepo.findById(req.account.workspace_id)
    : null;
  return sendOk(res, {
    user: {
      id: user.id, email: user.email, name: user.name,
      role: req.account.role, workspace_id: req.account.workspace_id,
      workspace_name: ws?.name,
      platform_admin: Number(user.is_platform_admin) === 1,
    },
  });
}));

// ════════════════════════════════════════════════════════════════════════════
//  Multi-workspace: membresías + switch del workspace activo
//  Un usuario puede ser OWNER de su workspace y MEMBER en otros (invitado).
//  La sesión JWT lleva UN workspace activo; estos endpoints listan las
//  membresías y re-emiten la cookie con el destino elegido.
// ════════════════════════════════════════════════════════════════════════════

// ── GET /workspaces — membresías del usuario (para el selector) ──
router.get('/workspaces', requireSession, asyncHandler(async (req, res) => {
  const memberships = await workspaceRepo.listMembershipsByUser(req.account.sub);
  return sendOk(res, {
    workspaces: memberships.map((m) => ({
      workspace_id: m.workspace_id,
      workspace_name: m.workspace_name,
      role: m.role,
      active: m.workspace_id === req.account.workspace_id,
    })),
  });
}));

// ── POST /switch-workspace — cambia el workspace activo de la sesión ──
//  Valida la membresía SERVER-SIDE (el token viejo no da derechos sobre el
//  destino) y desactiva el túnel activo del workspace saliente (1 túnel
//  activo global por persona — la mangle del router es por-usuario).
router.post('/switch-workspace', requireSession, asyncHandler(async (req, res) => {
  const { workspaceId } = SwitchWorkspaceRequestSchema.parse(req.body);

  const membership = await memberRepo.findMembership(workspaceId, req.account.sub);
  if (!membership) throw new AppError('No eres miembro de ese workspace', 403, 'NOT_A_MEMBER');
  const ws = await workspaceRepo.findById(workspaceId);
  if (!ws) throw new AppError('Workspace no encontrado', 404, 'NOT_FOUND');

  // Best-effort: cerrar el túnel del workspace saliente (mangle + sesión).
  // Un router caído NO bloquea el switch (§4.17); la sesión BD que quede
  // viva la cierra el próximo activate (cierre global) o el expirationJob.
  if (workspaceId !== req.account.workspace_id) {
    try {
      const ip = await getAppSetting('MT_IP');
      const user = await getAppSetting('MT_USER');
      const passData = await getAppSetting('MT_PASS');
      if (ip && user && passData) {
        await tunnelService.deactivateTunnel({
          account: req.account,
          mikrotik: { ip, user, pass: decryptPass(passData) },
          clientIp: req._clientIp || '-',
        });
      }
    } catch (e) {
      log.warn({ err: e?.message, from: req.account.workspace_id, to: workspaceId },
        'switch-workspace: no se pudo desactivar el túnel saliente (best-effort)');
    }
  }

  const user = await userRepo.findById(req.account.sub);
  const token = signSession({
    sub: req.account.sub, email: req.account.email,
    workspace_id: workspaceId, role: membership.role,
    platform_admin: !!req.account.platform_admin,
  });
  setSessionCookie(res, token);
  return sendOk(res, {
    user: {
      id: req.account.sub, email: req.account.email, name: user?.name,
      role: membership.role, workspace_id: workspaceId, workspace_name: ws.name,
      platform_admin: !!req.account.platform_admin,
    },
  });
}));

// ════════════════════════════════════════════════════════════════════════════
//  Ajustes del usuario logueado (Fase C)
// ════════════════════════════════════════════════════════════════════════════

// ── PATCH /password ──────────────────────────────────────────
//  Cambia la contraseña del usuario en sesión. Requiere la actual.
const changePasswordSchema = ChangePasswordRequestSchema;
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
const changeEmailRequestSchema = ChangeEmailRequestSchema;
router.patch('/email/request', requireSession, asyncHandler(async (req, res) => {
  const { newEmail } = changeEmailRequestSchema.parse(req.body);
  const lc = newEmail.toLowerCase();

  // El dominio sintético de cuentas locales no es un correo real.
  if (isSyntheticEmail(lc)) {
    throw new AppError('Ese dominio de correo está reservado', 400, 'EMAIL_RESERVED_DOMAIN');
  }
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
const changeEmailConfirmSchema = ChangeEmailConfirmSchema;
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

// ──────────────────────────────────────────────────────────────────────────
//  Q1 — Notificaciones por usuario
// ──────────────────────────────────────────────────────────────────────────
const notificationRepo = require('../db/repos/notificationRepo');
const telegram = require('../lib/telegram');
const { NotificationPreferencesSchema } = require('@gestionvpn/contracts');

/** Convierte ER_NO_SUCH_TABLE en un 503 con mensaje accionable. */
function asNotMigratedIfNeeded(err) {
  if (err && (err.code === 'ER_NO_SUCH_TABLE' || /doesn['’]t exist/i.test(err.message || ''))) {
    return new AppError('Tablas de notificaciones no creadas — el Administrador debe correr `npm run migrate:notifications`.', 503, 'NOTIFICATIONS_NOT_MIGRATED');
  }
  return err;
}

router.get('/notifications', requireSession, asyncHandler(async (req, res) => {
  // getOrDefault ya es defensivo (devuelve default si las tablas faltan),
  // así que este endpoint sirve 200 incluso sin migrar — el frontend ve
  // los defaults y puede mostrarlos sin error.
  const sub = await notificationRepo.getOrDefault(req.account.sub);
  return sendOk(res, {
    channels: sub.channels,
    eventTypes: sub.event_types,
    paused: sub.paused,
    telegramLinked: !!sub.telegram_chat_id,
    telegramBotConfigured: telegram.isConfigured(),
    telegramBotUsername: await telegram.getBotUsername(),
  });
}));

router.patch('/notifications', requireSession, asyncHandler(async (req, res) => {
  const { channels, eventTypes, paused } = NotificationPreferencesSchema.parse(req.body);
  try {
    await notificationRepo.updatePreferences({
      userId: req.account.sub,
      channels, eventTypes, paused,
    });
  } catch (err) { throw asNotMigratedIfNeeded(err); }
  return sendOk(res, { message: 'Preferencias actualizadas' });
}));

// Vinculación con Telegram — flujo de 2 pasos:
//   1) Cliente pide código (POST /telegram/link/start) → recibe { code, expiresAt }.
//   2) Usuario abre el bot, manda /link CODE — el bot llama al endpoint
//      público (handle por webhook o long-polling) que confirma.
//
//  En esta primera entrega solo exponemos el step 1 + un endpoint admin para
//  confirmar manualmente con chatId (útil hasta tener el bot en línea).
router.post('/telegram/link/start', requireSession, asyncHandler(async (req, res) => {
  if (!telegram.isConfigured()) {
    throw new AppError('El bot de Telegram no está habilitado en este servidor.', 503, 'TELEGRAM_NOT_CONFIGURED');
  }
  let r;
  try { r = await notificationRepo.generateTelegramLinkCode(req.account.sub); }
  catch (err) { throw asNotMigratedIfNeeded(err); }
  return sendOk(res, { code: r.code, expiresAt: r.expiresAt });
}));

router.post('/telegram/unlink', requireSession, asyncHandler(async (req, res) => {
  try { await notificationRepo.unlinkTelegram(req.account.sub); }
  catch (err) { throw asNotMigratedIfNeeded(err); }
  return sendOk(res, { message: 'Telegram desvinculado' });
}));

module.exports = router;
