const express = require('express');
const router = express.Router();
const { hasUsers, getUserByUsername, createInitialUser, updateLegacyPasswordHashIfCurrent } = require('./db.service');
const { hashPassword, verifyAndUpgrade } = require('./lib/passwordHasher');
const { setSessionCookie } = require('./lib/jwt');
const { buildSessionForLegacyUser, authenticateMysqlUser } = require('./lib/sessionBridge');
const userRepo = require('./db/repos/userRepo');
const passwordResetRepo = require('./db/repos/passwordResetRepo');
const { sendPasswordReset } = require('./lib/mailer');
const rl = require('./lib/rateLimit');
const { invalidateUserCache } = require('./middleware/authJwt');
const log = require('./lib/logger').child({ scope: 'auth' });
const { sendOk, sendError } = require('./lib/apiResponse');
const metrics = require('./lib/metrics');
const {
  LoginRequestSchema,
  SetupRequestSchema,
  PasswordResetRequestSchema,
  PasswordResetConfirmSchema,
} = require('@gestionvpn/contracts');

// Establece la sesión RBAC por cookie a partir del login legacy.
async function attachRbacSession(res, username) {
  const { token } = await buildSessionForLegacyUser(username);
  setSessionCookie(res, token);
}

// Schemas Zod centralizados en @gestionvpn/contracts (F5). Aliases locales
// para mantener legibilidad sin tocar el resto del handler.
const loginSchema = LoginRequestSchema;
const setupSchema = SetupRequestSchema;
const GENERIC_BAD_CREDENTIALS = 'Correo o contraseña incorrectos';

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
router.post('/setup', rl.guardPolicy('SETUP', { identityField: 'username' }), async (req, res) => {
    try {
        const configured = await hasUsers();
        if (configured) {
            return sendError(res, 403, 'La aplicación ya fue inicializada. Inicie sesión.', 'ALREADY_SETUP');
        }

        const { username, password } = setupSchema.parse(req.body);
        const hash = await hashPassword(password);

        // Crear un único primer usuario incluso con varias instancias/request concurrentes.
        const created = await createInitialUser(username, hash, 'admin');
        if (!created) {
            return sendError(res, 403, 'La aplicación ya fue inicializada. Inicie sesión.', 'ALREADY_SETUP');
        }

        await attachRbacSession(res, username);

        return sendOk(res, {
            message: 'Administrador creado y logueado exitosamente',
            user: username,
            role: 'admin',
        });
    } catch (error) {
        const issues = error.issues || error.errors;
        if (issues) return res.status(400).json({ success: false, message: 'Datos inválidos', code: 'VALIDATION_ERROR', errors: issues });
        return sendError(res, 500, error.message, 'INTERNAL');
    }
});

router.post('/login', rl.guardPolicy('LOGIN', { identityField: 'username' }), async (req, res) => {
    try {
        const { username, password } = loginSchema.parse(req.body);

        let dbError = null;

        // 1) Usuario legacy (vpn_users/MySQL) por username
        let row = null;
        try { row = await getUserByUsername(username); }
        catch (e) { dbError = e; }
        if (row) {
          const legacyVerification = await verifyAndUpgrade(
            password,
            row.password_hash,
            (nextHash, currentHash) => updateLegacyPasswordHashIfCurrent(row.username, nextHash, currentHash)
          );
          if (!legacyVerification.valid) {
            metrics.authFailsTotal.inc({ reason: 'bad_password' });
            return sendError(res, 401, GENERIC_BAD_CREDENTIALS, 'BAD_CREDENTIALS');
          }

            try {
                await attachRbacSession(res, row.username);
            } catch (e) {
                dbError = e;
            }
            if (!dbError) {
                await rl.clearSuccessfulIdentity(req);
                return sendOk(res, { message: 'Conectado exitosamente', user: row.username, role: row.role });
            }
        }

        // 2) Usuario multi-tenant (MySQL): Moderador / Miembro por email
        if (!dbError && !row) {
            try {
                const s = await authenticateMysqlUser(username, password);
                if (s) {
                    await rl.clearSuccessfulIdentity(req);
                    setSessionCookie(res, s.token);
                    const legacyRole = s.user.role === 'MEMBER' ? 'viewer' : 'admin';
                    return sendOk(res, {
                        message: 'Conectado exitosamente',
                        user: s.user.email, role: legacyRole,
                    });
                }
            } catch (e) { dbError = e; }
        }

        // Distinguir BD caída de credenciales inválidas (evita el engañoso "contraseña incorrecta")
        if (dbError) {
            log.error({ code: dbError.code, err: dbError.message }, 'Base de datos no disponible en login');
            metrics.authFailsTotal.inc({ reason: 'db_unavailable' });
            return sendError(
                res, 503,
                'Servicio de base de datos no disponible. Verifica que MySQL (XAMPP) esté iniciado e inténtalo de nuevo.',
                'DB_UNAVAILABLE'
            );
        }

        // authenticateMysqlUser ya registra la razón interna sin exponerla.
        return sendError(res, 401, GENERIC_BAD_CREDENTIALS, 'BAD_CREDENTIALS');
    } catch (zodError) {
        metrics.authFailsTotal.inc({ reason: 'validation' });
        return res.status(400).json({ success: false, message: 'Datos de entrada inválidos', code: 'VALIDATION_ERROR', errors: zodError.issues || zodError.errors });
    }
});

// Obtener datos de la sesión RBAC activa.
router.get('/me', require('./auth.middleware').verifyToken, (req, res) => {
    const acc = req.account;
    return sendOk(res, { user: (acc.email || '').split('@')[0], role: acc.platform_admin ? 'admin' : acc.role });
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

router.post('/password-reset/request', rl.guardPolicy('RESET_REQUEST'), async (req, res) => {
  const ip = req._clientIp;
  try {
    const { email } = requestResetSchema.parse(req.body);

    // Lookup silencioso del user. Independientemente del resultado,
    // devolvemos el mismo mensaje genérico (anti-enumeración).
    const user = await userRepo.findByEmail(email).catch(() => null);

    const recent = await passwordResetRepo.countRecent(
      user?.id || '00000000-0000-0000-0000-000000000000',
      60 * 60 * 1000
    );
    const { token, hash } = await passwordResetRepo.generateToken();
    if (user && recent < MAX_PENDING_TOKENS_PER_HOUR) {
      // Persistencia + correo en background: la latencia HTTP no revela si
      // hubo una cuenta real. La cadena conserva el orden token -> correo.
      void passwordResetRepo.create({ userId: user.id, tokenHash: hash, ipAddress: ip })
        .then(() => sendPasswordReset({ email: user.email, token, name: user.name }))
        .catch(e => log.warn({ code: e?.code || 'UNKNOWN' }, 'password-reset: emisión falló'));
    }
    return res.json(GENERIC_OK);
  } catch (err) {
    // Errores de validación → 400, pero sin pistas sobre existencia del email
    if ((err.issues || err.errors)) return sendError(res, 400, 'Datos inválidos', 'VALIDATION_ERROR');
    log.error({ err: err.message }, 'password-reset/request error');
    return res.json(GENERIC_OK); // tampoco filtramos errores internos
  }
});

router.post('/password-reset/confirm', rl.guardPolicy('RESET_CONFIRM'), async (req, res) => {
  try {
    const { token, newPassword } = confirmResetSchema.parse(req.body);

    const found = await passwordResetRepo.findValid(token);
    if (!found) {
      metrics.authFailsTotal.inc({ reason: 'reset_token_invalid' });
      return sendError(res, 401, 'El enlace es inválido o ya fue usado. Solicita uno nuevo.', 'INVALID_TOKEN');
    }

    // Actualizar contraseña + marcar token como usado + invalidar el resto
    const hash = await hashPassword(newPassword);
    const now = Date.now();
    const { query } = require('./db/mysql');
    await query('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', [hash, now, found.userId]);
    await passwordResetRepo.markUsed(found.id);
    await passwordResetRepo.invalidateForUser(found.userId);

    // Por seguridad: invalidar sesiones activas del user (cache de auth)
    invalidateUserCache(found.userId);

    return sendOk(res, { message: 'Contraseña actualizada. Ya puedes iniciar sesión con tu nueva clave.' });
  } catch (err) {
    if ((err.issues || err.errors)) return res.status(400).json({ success: false, message: 'Datos inválidos', code: 'VALIDATION_ERROR', errors: (err.issues || err.errors) });
    log.error({ err: err.message }, 'password-reset/confirm error');
    return sendError(res, 500, 'No se pudo restablecer la contraseña', 'INTERNAL');
  }
});

module.exports = router;
