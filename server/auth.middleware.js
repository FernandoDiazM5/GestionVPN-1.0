const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs');
const { getAppSetting, decryptPass } = require('./db.service');

const SECRET_FILE = `${process.env.DATA_DIR || '.'}/.jwt_secret`;
let JWT_SECRET;
if (fs.existsSync(SECRET_FILE)) {
    JWT_SECRET = fs.readFileSync(SECRET_FILE, 'utf8');
} else {
    JWT_SECRET = crypto.randomBytes(64).toString('hex');
    fs.writeFileSync(SECRET_FILE, JWT_SECRET, { mode: 0o600 });
}

const verifyToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    // EventSource no admite headers — acepta token por query string como fallback
    const token = (authHeader && authHeader.split(' ')[1]) || req.query.token;

    if (!token) {
        return res.status(401).json({ success: false, message: 'Acceso Denegado: Token no provisto.' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded; // { username, role }

        // Inject MikroTik credentials from SQLite settings automatically
        const mtIp = await getAppSetting('MT_IP');
        const mtUser = await getAppSetting('MT_USER');
        const mtPassData = await getAppSetting('MT_PASS');

        if (mtIp && mtUser && mtPassData) {
            req.mikrotik = {
                ip: mtIp,
                user: mtUser,
                pass: decryptPass(mtPassData)
            };
        } else {
            req.mikrotik = null;
        }

        next();
    } catch (err) {
        return res.status(403).json({ success: false, message: 'Token de sesión expirado.', logout: true });
    }
};

module.exports = { verifyToken, JWT_SECRET };
