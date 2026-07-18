// Compatibilidad para routers legacy: la verificación autoritativa vive en
// middleware/authJwt.js. No mantener aquí una segunda política de sesión.
const { requireSessionWithMikrotik } = require('./middleware/authJwt');
const { JWT_SECRET } = require('./lib/jwt');

module.exports = { verifyToken: requireSessionWithMikrotik, JWT_SECRET };
