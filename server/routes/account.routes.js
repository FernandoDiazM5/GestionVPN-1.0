// ============================================================
//  Rutas de cuenta multi-tenant (Fase 2)
//  Registro con verificación OTP, login, logout y sesión.
//  Convive con /api/auth (legacy) sin interferir. Base: /api/account
// ============================================================
const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { hashPassword, verifyPassword } = require('../lib/passwordHasher');
const { authenticateMysqlUser } = require('../lib/sessionBridge');
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
} = require('@gestionvpn/contracts');

const { asyncHandler, AppError, sendOk } = require('../lib/apiResponse');
const { withTransaction } = require('../db/mysql');
const { setSessionCookie, clearSessionCookie } = require('../lib/jwt');
const {
  issueSession,
  rotateSession,
  replaceAllSessions,
  revokeSession,
  revokeAllSessions,
} = require('../lib/sessionService');
const { sendOtp } = require('../lib/mailer');
const rl = require('../lib/rateLimit');
const userRepo = require('../db/repos/userRepo');
const workspaceRepo = require('../db/repos/workspaceRepo');
const { requireSession } = require('../middleware/authJwt');
const { query } = require('../db/mysql');
const log = require('../lib/logger').child({ scope: 'account' });
const tunnelService = require('../lib/tunnelService');
const { loadCoreMikrotik } = require('../lib/coreMikrotikSettings');

const router = express.Router();

const OTP_TTL_MS = 10 * 60 * 1000;   // 10 min
const OTP_MAX_ATTEMPTS = 5;
const GENERIC_REGISTER_MESSAGE = 'Si el registro puede procesarse, recibirás un código de verificación.';
const GENERIC_RESEND_MESSAGE = 'Si la cuenta requiere verificación, se enviará un código.';
const GENERIC_BAD_CREDENTIALS = 'Correo o contraseña incorrectos';

async function revokeTunnelBeforeLogout(account, requestIp) {
  if (!account?.sub || !account?.workspace_id) return;
  const mikrotik = await loadCoreMikrotik();
  if (!mikrotik) {
    log.warn({ userId: account.sub }, 'logout: MikroTik no configurado; expiración reintentará la revocación');
    return;
  }
  const result = await tunnelService.deactivateTunnel({
    account,
    mikrotik,
    clientIp: requestIp,
    action: 'LOGOUT',
  });
  if (!result.ok) {
    log.warn({ userId: account.sub, code: result.code }, 'logout: no se pudo revocar el túnel; expiración reintentará');
  }
}

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
router.post('/register', rl.guardPolicy('REGISTER'), asyncHandler(async (req, res) => {
  const { email, password, name } = registerSchema.parse(req.body);

  const existing = await userRepo.findByEmail(email);
  // El mismo trabajo criptográfico se ejecuta aunque el correo ya exista.
  const passwordHash = await hashPassword(password);
  const otp = genOtp();
  const otpHash = await bcrypt.hash(otp, 8);
  const otpExpiresAt = Date.now() + OTP_TTL_MS;

  if (!existing) {
    // La escritura y el correo no alteran la latencia HTTP según existencia.
    // El correo sólo sale después de persistir correctamente el usuario.
    void userRepo.createPending({
        id: crypto.randomUUID(), email, passwordHash, name, otpHash, otpExpiresAt,
      })
      .then(() => sendOtp(email, otp, 'verificación de cuenta'))
      .catch(error => {
        if (error?.code !== 'ER_DUP_ENTRY') {
          log.error({ code: error?.code || 'UNKNOWN' }, 'register: emisión falló');
        }
      });
  }
  return sendOk(res, { message: GENERIC_REGISTER_MESSAGE }, 202);
}));

// ── POST /verify ─────────────────────────────────────────────
router.post('/verify', rl.guardPolicy('OTP_VERIFY'), asyncHandler(async (req, res) => {
  const { email, otp } = verifySchema.parse(req.body);
  const user = await userRepo.findByEmail(email);
  if (!user || user.email_verified) {
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

  await rl.clearSuccessfulIdentity(req);

  const { token } = await issueSession({
    sub: user.id, email: user.email, workspace_id: workspaceId, role: 'OWNER', platform_admin: false,
  });
  setSessionCookie(res, token);
  return sendOk(res, { user: { id: user.id, email: user.email, role: 'OWNER', workspace_id: workspaceId } });
}));

// ── POST /resend ─────────────────────────────────────────────
router.post('/resend', rl.guardPolicy('OTP_SEND'), asyncHandler(async (req, res) => {
  const { email } = ResendRequestSchema.parse(req.body);
  const user = await userRepo.findByEmail(email);
  const otp = genOtp();
  const otpHash = await bcrypt.hash(otp, 8);
  if (user && !user.email_verified) {
    void userRepo.setOtp(user.id, otpHash, Date.now() + OTP_TTL_MS)
      .then(() => sendOtp(email, otp, 'verificación de cuenta'))
      .catch(error => log.warn({ code: error?.code || 'UNKNOWN' }, 'resend: emisión falló'));
  }
  return sendOk(res, { message: GENERIC_RESEND_MESSAGE });
}));

// ── POST /login ──────────────────────────────────────────────
router.post('/login', rl.guardPolicy('LOGIN'), asyncHandler(async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);
  const session = await authenticateMysqlUser(email, password, { includeFailure: true, requestIp: req._clientIp });
  if (session?.denied === 'locked') {
    throw new AppError('Cuenta bloqueada temporalmente por intentos incorrectos. Puedes restablecer tu clave o solicitar desbloqueo.', 423, 'ACCOUNT_LOCKED', { lockedUntil: session.lockedUntil });
  }
  if (!session || session.denied) throw new AppError(GENERIC_BAD_CREDENTIALS, 401, 'BAD_CREDENTIALS');

  await rl.clearSuccessfulIdentity(req);
  setSessionCookie(res, session.token);
  return sendOk(res, {
    user: session.user,
  });
}));

// ── POST /logout ─────────────────────────────────────────────
router.post('/logout', requireSession, asyncHandler(async (req, res) => {
  await revokeTunnelBeforeLogout(req.account, req.ip);
  await revokeSession(req.account.jti, req.account.sub);
  clearSessionCookie(res);
  return sendOk(res, { message: 'Sesión cerrada' });
}));

router.post('/logout-all', requireSession, asyncHandler(async (req, res) => {
  await revokeTunnelBeforeLogout(req.account, req.ip);
  await revokeAllSessions(req.account.sub);
  clearSessionCookie(res);
  return sendOk(res, { message: 'Sesiones cerradas en todos los dispositivos' });
}));

router.get('/session-status', requireSession, (req, res) => sendOk(res, {
  expiresAt: Number(req.account.exp) * 1000,
}));

router.post('/session-renew', requireSession, asyncHandler(async (req, res) => {
  const renewed = await rotateSession(req.account);
  setSessionCookie(res, renewed.token);
  return sendOk(res, { expiresAt: renewed.expiresAt });
}));

// Ausencia de cookie durante el arranque del login no es un error. Si existe
// cookie, requireSession conserva todas las validaciones (expirada/suspendida).
function optionalSession(req, res, next) {
  if (!req.cookies?.vpn_session) return next();
  return requireSession(req, res, next);
}

// ── GET /me ──────────────────────────────────────────────────
router.get('/me', optionalSession, asyncHandler(async (req, res) => {
  if (!req.account) return sendOk(res, { user: null });
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
      workspace_slug: ws?.slug,
      platform_admin: Number(user.is_platform_admin) === 1,
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

  const ok = await verifyPassword(currentPassword, user.password_hash);
  if (!ok) throw new AppError('La contraseña actual es incorrecta', 401, 'BAD_CURRENT');

  if (currentPassword === newPassword) {
    throw new AppError('La nueva contraseña debe ser distinta de la actual', 400, 'SAME_PASSWORD');
  }

  const newHash = await hashPassword(newPassword);
  await query('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?',
    [newHash, Date.now(), user.id]);
  // Revoca todas las sesiones previas y conserva únicamente esta sesión
  // mediante un nuevo jti/cookie.
  const renewed = await replaceAllSessions(req.account);
  setSessionCookie(res, renewed.token);

  return sendOk(res, { message: 'Contraseña actualizada' });
}));

// ── PATCH /email/request ─────────────────────────────────────
//  Solicita cambio de correo. Envía OTP al NUEVO email (anti-hijack).
const changeEmailRequestSchema = ChangeEmailRequestSchema;
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
const changeEmailConfirmSchema = ChangeEmailConfirmSchema;
router.post('/email/confirm', requireSession, asyncHandler(async (req, res) => {
  const { newEmail, otp, currentPassword } = changeEmailConfirmSchema.parse(req.body);
  const lc = newEmail.toLowerCase();

  const user = await userRepo.findById(req.account.sub);
  if (!user) throw new AppError('Usuario no encontrado', 404, 'NOT_FOUND');

  const passOk = await verifyPassword(currentPassword, user.password_hash);
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
  const renewed = await replaceAllSessions(req.account, { email: lc });
  setSessionCookie(res, renewed.token);

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
