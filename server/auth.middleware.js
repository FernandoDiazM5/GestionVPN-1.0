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
// rol RBAC a un rol legacy (`mapRbacRole` eliminado): conflaba OWNER→'admin'
// y era el origen del gap A2. `req.user` solo se conserva para tokens LEGACY puros
// (sin RBAC), que el bridge legacy→RBAC necesita por username.

const verifyToken = async (req, res, next) => {
    const cookieTok = req.cookies && req.cookies['vpn_session'];
    if (!cookieTok) {
        metrics.authFailsTotal.inc({ reason: 'no_token' });
        return res.status(401).json({ success: false, message: 'Acceso denegado: sesión no iniciada.' });
    }

    try {
        const session = jwt.verify(cookieTok, JWT_SECRET);
        if (!session || !session.sub || !session.workspace_id) {
            throw new Error('Sesión sin identidad RBAC');
        }
        req.account = session;
        await injectMikrotik(req);
        return next();
    } catch (_) {
        metrics.authFailsTotal.inc({ reason: 'expired_token' });
        return res.status(403).json({ success: false, message: 'Token de sesión expirado.', logout: true });
    }
};

module.exports = { verifyToken, JWT_SECRET };
