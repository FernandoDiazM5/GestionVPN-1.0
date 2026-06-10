const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { hasUsers, getUserByUsername, createUser } = require('./db.service');
const { JWT_SECRET } = require('./auth.middleware');
const { setSessionCookie } = require('./lib/jwt');
const { buildSessionForLegacyUser, authenticateMysqlUser } = require('./lib/sessionBridge');
const userRepo = require('./db/repos/userRepo');
const passwordResetRepo = require('./db/repos/passwordResetRepo');
const { sendPasswordReset } = require('./lib/mailer');
const rl = require('./lib/rateLimit');
const { invalidateUserCache } = require('./middleware/authJwt');
const log = require('./lib/logger').child({ scope: 'auth' });
const { sendOk, sendError } = require('./lib/apiResponse');
const {
  LoginRequestSchema,
  SetupRequestSchema,
  PasswordResetRequestSchema,
  PasswordResetConfirmSchema,
} = require('@gestionvpn/contracts');

// Establece (si es posible) la sesión RBAC por cookie a partir del login legacy.
// No rompe el login si MySQL está caído: degrada a solo-Bearer.
async function attachRbacSession(res, username) {
  try {
    const { token } = await buildSessionForLegacyUser(username);
    setSessionCookie(res, token);
  } catch (e) {
    log.warn({ err: e.message }, 'sesión RBAC no establecida (login continúa con Bearer)');
  }
}

// Schemas Zod centralizados en @gestionvpn/contracts (F5). Aliases locales
// para mantener legibilidad sin tocar el resto del handler.
const loginSchema = LoginRequestSchema;
const setupSchema = SetupRequestSchema;

// Endpoint para estado inicial (saber si hay que mostrar pantalla de Setup o Login)
router.get('/status', async (req, res) => {
    try {
        const configured = await hasUsers();
        return sendOk(res, { needsSetup: !configured });
    } catch (e) {
        return sendError(res, 500, e.message, 'INTERNAL');
    }
});

// Endpoint de Setup inicial (sólo funciona si no hay usuarios)
router.post('/setup', async (req, res) => {
    try {
        const configured = await hasUsers();
        if (configured) {
            return sendError(res, 403, 'La aplicación ya fue inicializada. Inicie sesión.', 'ALREADY_SETUP');
        }

        const { username, password } = setupSchema.parse(req.body);
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(password, salt);

        // Crear el primer usuario como rol "admin"
        await createUser(username, hash, 'admin');

        // Generar JWT y loguear
        // Setup: primer usuario, aún no tiene row.id — consultar después de crear
        const newUser = await getUserByUsername(username);
        const token = jwt.sign({ id: newUser.id, username, role: 'admin' }, JWT_SECRET, { expiresIn: '24h' });

        await attachRbacSession(res, username);

        return sendOk(res, {
            message: 'Administrador creado y logueado exitosamente',
            token,
            user: username,
            role: 'admin',
        });
    } catch (error) {
        const issues = error.issues || error.errors;
        if (issues) return res.status(400).json({ success: false, message: 'Datos inválidos', code: 'VALIDATION_ERROR', errors: issues });
        return sendError(res, 500, error.message, 'INTERNAL');
    }
});

router.post('/login', async (req, res) => {
    try {
        const { username, password } = loginSchema.parse(req.body);

        let dbError = null;

        // 1) Usuario legacy (vpn_users/MySQL) por username
        let row = null;
        try { row = await getUserByUsername(username); }
        catch (e) { dbError = e; }
        if (row && await bcrypt.compare(password, row.password_hash)) {
            const token = jwt.sign({ id: row.id, username: row.username, role: row.role }, JWT_SECRET, { expiresIn: '24h' });
            await attachRbacSession(res, row.username);
            return sendOk(res, { message: 'Conectado exitosamente', token, user: row.username, role: row.role });
        }

        // 2) Usuario multi-tenant (MySQL): Moderador / Miembro por email
        if (!dbError) {
            try {
                const s = await authenticateMysqlUser(username, password);
                if (s) {
                    setSessionCookie(res, s.token);
                    const legacyRole = s.user.role === 'MEMBER' ? 'viewer' : 'admin';
                    return sendOk(res, {
                        message: 'Conectado exitosamente',
                        token: s.token, user: s.user.email, role: legacyRole,
                    });
                }
            } catch (e) { dbError = e; }
        }

        // Distinguir BD caída de credenciales inválidas (evita el engañoso "contraseña incorrecta")
        if (dbError) {
            log.error({ code: dbError.code, err: dbError.message }, 'Base de datos no disponible en login');
            return sendError(
                res, 503,
                'Servicio de base de datos no disponible. Verifica que MySQL (XAMPP) esté iniciado e inténtalo de nuevo.',
                'DB_UNAVAILABLE'
            );
        }

        return sendError(res, 401, 'Usuario o contraseña incorrectos', 'BAD_CREDENTIALS');
    } catch (zodError) {
        return res.status(400).json({ success: false, message: 'Datos de entrada inválidos', code: 'VALIDATION_ERROR', errors: zodError.issues || zodError.errors });
    }
});

// Obtener datos del JWT activo
router.get('/me', require('./auth.middleware').verifyToken, (req, res) => {
    return sendOk(res, { user: req.user.username, role: req.user.role });
});

// Refresh token — emite un nuevo JWT si el actual es válido
router.post('/refresh', (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return sendError(res, 401, 'Token requerido', 'NO_TOKEN');
    }
    try {
        const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
        const token = jwt.sign(
            { id: decoded.id, username: decoded.username, role: decoded.role },
            JWT_SECRET,
            { expiresIn: '24h' }
        );
        return sendOk(res, { token, expiresIn: 86400 });
    } catch {
        return sendError(res, 403, 'Token inválido o expirado', 'INVALID_TOKEN');
    }
});

// ════════════════════════════════════════════════════════════════════════════
//  Recuperación de contraseña (Fase D)
//
//  • Anti-enumeración: SIEMPRE devolvemos 200 OK con mensaje genérico, exista
//    el email o no. Esto evita que un atacante use el endpoint para descubrir
//    qué emails están registrados en el sistema.
//  • Rate limit: el guard de auth_attempts ('OTP') bloquea la IP tras 5 fallos
//    en 15 min. Aquí se cuenta el "fallo" cuando se llega al tope de tokens
//    pendientes para el mismo user (anti-flood).
//  • Token: 32 bytes hex (crypto.randomBytes), guardado SOLO como bcrypt hash.
//    Expira en 15 min y es single-use.
// ════════════════════════════════════════════════════════════════════════════

const MAX_PENDING_TOKENS_PER_HOUR = 5;
const requestResetSchema = PasswordResetRequestSchema;
const confirmResetSchema = PasswordResetConfirmSchema;
const GENERIC_OK = {
  success: true,
  message: 'Si el correo está registrado, te enviamos un enlace para restablecer tu contraseña.',
};

router.post('/password-reset/request', rl.guard('OTP'), async (req, res) => {
  const ip = req._clientIp;
  try {
    const { email } = requestResetSchema.parse(req.body);

    // Lookup silencioso del user. Independientemente del resultado,
    // devolvemos el mismo mensaje genérico (anti-enumeración).
    const user = await userRepo.findByEmail(email).catch(() => null);

    if (user) {
      // Anti-spam: máx 5 tokens emitidos por usuario en la última hora
      const recent = await passwordResetRepo.countRecent(user.id, 60 * 60 * 1000);
      if (recent >= MAX_PENDING_TOKENS_PER_HOUR) {
        await rl.recordAttempt(ip, 'OTP', email, false);
      } else {
        const { token, hash } = await passwordResetRepo.generateToken();
        await passwordResetRepo.create({ userId: user.id, tokenHash: hash, ipAddress: ip });
        // Envío de correo en background (no bloquea el response)
        sendPasswordReset({ email: user.email, token, name: user.name })
          .catch(e => log.warn({ err: e.message }, 'password-reset: mail falló'));
        await rl.recordAttempt(ip, 'OTP', email, true);
      }
    }
    return res.json(GENERIC_OK);
  } catch (err) {
    // Errores de validación → 400, pero sin pistas sobre existencia del email
    if ((err.issues || err.errors)) return sendError(res, 400, 'Datos inválidos', 'VALIDATION_ERROR');
    log.error({ err: err.message }, 'password-reset/request error');
    return res.json(GENERIC_OK); // tampoco filtramos errores internos
  }
});

router.post('/password-reset/confirm', rl.guard('OTP'), async (req, res) => {
  const ip = req._clientIp;
  try {
    const { token, newPassword } = confirmResetSchema.parse(req.body);

    const found = await passwordResetRepo.findValid(token);
    if (!found) {
      await rl.recordAttempt(ip, 'OTP', null, false);
      return sendError(res, 401, 'El enlace es inválido o ya fue usado. Solicita uno nuevo.', 'INVALID_TOKEN');
    }

    // Actualizar contraseña + marcar token como usado + invalidar el resto
    const hash = await bcrypt.hash(newPassword, 10);
    const now = Date.now();
    const { query } = require('./db/mysql');
    await query('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', [hash, now, found.userId]);
    await passwordResetRepo.markUsed(found.id);
    await passwordResetRepo.invalidateForUser(found.userId);

    // Por seguridad: invalidar sesiones activas del user (cache de auth)
    invalidateUserCache(found.userId);

    await rl.recordAttempt(ip, 'OTP', null, true);
    return sendOk(res, { message: 'Contraseña actualizada. Ya puedes iniciar sesión con tu nueva clave.' });
  } catch (err) {
    if ((err.issues || err.errors)) return res.status(400).json({ success: false, message: 'Datos inválidos', code: 'VALIDATION_ERROR', errors: (err.issues || err.errors) });
    log.error({ err: err.message }, 'password-reset/confirm error');
    return sendError(res, 500, 'No se pudo restablecer la contraseña', 'INTERNAL');
  }
});

module.exports = router;
