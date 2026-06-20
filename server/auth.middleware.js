const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs');
const { getAppSetting, decryptPass } = require('./db.service');
const metrics = require('./lib/metrics');

const SECRET_FILE = `${process.env.DATA_DIR || __dirname}/.jwt_secret`;
let JWT_SECRET;
if (fs.existsSync(SECRET_FILE)) {
    JWT_SECRET = fs.readFileSync(SECRET_FILE, 'utf8');
} else {
    JWT_SECRET = crypto.randomBytes(64).toString('hex');
    fs.writeFileSync(SECRET_FILE, JWT_SECRET, { mode: 0o600 });
}

// Inyecta credenciales MikroTik desde MySQL (igual para ambos métodos de auth)
async function injectMikrotik(req) {
    const mtIp = await getAppSetting('MT_IP');
    const mtUser = await getAppSetting('MT_USER');
    const mtPassData = await getAppSetting('MT_PASS');
    req.mikrotik = (mtIp && mtUser && mtPassData)
        ? { ip: mtIp, user: mtUser, pass: decryptPass(mtPassData) }
        : null;
}

// M2: las guardas de autorización derivan de req.account (RBAC). Ya no se mapea el
// rol RBAC a un rol legacy (`mapRbacRole` eliminado): conflaba OWNER/CO_MOD→'admin'
// y era el origen del gap A2. `req.user` solo se conserva para tokens LEGACY puros
// (sin RBAC), que el bridge legacy→RBAC necesita por username.

const verifyToken = async (req, res, next) => {
    // ── 1) Sesión RBAC por cookie (sistema unificado) ──
    const cookieTok = req.cookies && req.cookies['vpn_session'];
    if (cookieTok) {
        try {
            const s = jwt.verify(cookieTok, JWT_SECRET);
            if (s && s.sub && s.workspace_id) {
                req.account = s; // { sub, email, workspace_id, role, platform_admin }
                await injectMikrotik(req);
                return next();
            }
        } catch (_) { /* cookie inválida/expirada → intenta Bearer */ }
    }

    // ── 2) Fallback legacy: Bearer header o token por query (EventSource) ──
    const authHeader = req.headers['authorization'];
    const token = (authHeader && authHeader.split(' ')[1]) || req.query.token;
    if (!token) {
        metrics.authFailsTotal.inc({ reason: 'no_token' });
        return res.status(401).json({ success: false, message: 'Acceso Denegado: Token no provisto.' });
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded && decoded.sub && decoded.workspace_id) {
            // Token RBAC usado como Bearer (moderador/miembro)
            req.account = decoded;
        } else {
            req.user = decoded; // token LEGACY puro { id, username, role } → bridge legacy→RBAC
        }
        await injectMikrotik(req);
        next();
    } catch (err) {
        metrics.authFailsTotal.inc({ reason: 'expired_token' });
        return res.status(403).json({ success: false, message: 'Token de sesión expirado.', logout: true });
    }
};

module.exports = { verifyToken, JWT_SECRET };
