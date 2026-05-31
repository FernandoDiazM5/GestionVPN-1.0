const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs');
const { getAppSetting, decryptPass } = require('./db.service');

const SECRET_FILE = `${process.env.DATA_DIR || __dirname}/.jwt_secret`;
let JWT_SECRET;
if (fs.existsSync(SECRET_FILE)) {
    JWT_SECRET = fs.readFileSync(SECRET_FILE, 'utf8');
} else {
    JWT_SECRET = crypto.randomBytes(64).toString('hex');
    fs.writeFileSync(SECRET_FILE, JWT_SECRET, { mode: 0o600 });
}

// Inyecta credenciales MikroTik desde SQLite (igual para ambos métodos de auth)
async function injectMikrotik(req) {
    const mtIp = await getAppSetting('MT_IP');
    const mtUser = await getAppSetting('MT_USER');
    const mtPassData = await getAppSetting('MT_PASS');
    req.mikrotik = (mtIp && mtUser && mtPassData)
        ? { ip: mtIp, user: mtUser, pass: decryptPass(mtPassData) }
        : null;
}

// Mapea el rol RBAC (cookie) al rol legacy esperado por las rutas existentes
function mapRbacRole(role) {
    return role === 'MEMBER' ? 'viewer' : 'admin'; // OWNER / CO_MODERATOR → admin
}

const verifyToken = async (req, res, next) => {
    // ── 1) Sesión RBAC por cookie (sistema unificado) ──
    const cookieTok = req.cookies && req.cookies['vpn_session'];
    if (cookieTok) {
        try {
            const s = jwt.verify(cookieTok, JWT_SECRET);
            if (s && s.sub && s.workspace_id) {
                req.account = s; // { sub, email, workspace_id, role }
                req.user = { id: s.sub, username: (s.email || '').split('@')[0], role: mapRbacRole(s.role) };
                await injectMikrotik(req);
                return next();
            }
        } catch (_) { /* cookie inválida/expirada → intenta Bearer */ }
    }

    // ── 2) Fallback legacy: Bearer header o token por query (EventSource) ──
    const authHeader = req.headers['authorization'];
    const token = (authHeader && authHeader.split(' ')[1]) || req.query.token;
    if (!token) {
        return res.status(401).json({ success: false, message: 'Acceso Denegado: Token no provisto.' });
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded && decoded.sub && decoded.workspace_id) {
            // Token RBAC usado como Bearer (moderador/miembro)
            req.account = decoded;
            req.user = { id: decoded.sub, username: (decoded.email || '').split('@')[0], role: mapRbacRole(decoded.role) };
        } else {
            req.user = decoded; // token legacy { id, username, role }
        }
        await injectMikrotik(req);
        next();
    } catch (err) {
        return res.status(403).json({ success: false, message: 'Token de sesión expirado.', logout: true });
    }
};

module.exports = { verifyToken, JWT_SECRET };
