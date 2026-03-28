const jwt = require('jsonwebtoken');
const fs = require('fs');
const { decryptPass } = require('./db.service');

const DATA_DIR = process.env.DATA_DIR || '.';
const SECRET_FILE = `${DATA_DIR}/.db_secret`;
let JWT_SECRET = 'fallback_jwt_secret_12345'; // Sólo se usa si falla leer db_secret

if (fs.existsSync(SECRET_FILE)) {
    JWT_SECRET = fs.readFileSync(SECRET_FILE, 'utf8');
}

function verifyToken(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, message: 'Token de acceso no proveído o formato inválido' });
    }
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        
        // Desencriptamos la contraseña desde el payload del JWT
        // (fue encriptada con encryptPass al momento de hacer login)
        const password = decryptPass(decoded.encPass);
        
        // Inyectamos las credenciales seguras en request para que el resto de rutas las use
        req.mikrotik = { ip: decoded.ip, user: decoded.user, pass: password };
        
        // Magia para CERO REFACTOR en las 1000+ líneas de rutas existentes:
        // Mezclamos las credenciales en req.body para que const { ip, user, pass } = req.body; siga funcionando.
        req.body.ip = decoded.ip;
        req.body.user = decoded.user;
        req.body.pass = password;
        
        next();
    } catch (err) {
        console.error('[AUTH] Refused Token:', err.message);
        return res.status(401).json({ success: false, message: 'Sesión expirada o token inválido' });
    }
}

module.exports = { verifyToken, JWT_SECRET };
