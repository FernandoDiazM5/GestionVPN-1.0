const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const { connectToMikrotik, getErrorMessage } = require('./routeros.service');
const { encryptPass } = require('./db.service');
const { JWT_SECRET } = require('./auth.middleware');

// Validación estricta Zod para el login
const loginSchema = z.object({
    ip: z.string().ip({ message: "IP inválida" }).or(z.string().min(3)), // Soporta dominios también
    user: z.string().min(1, "El usuario es requerido"),
    pass: z.string().default('')
});

router.post('/login', async (req, res) => {
    try {
        const { ip, user, pass } = loginSchema.parse(req.body);

        let api;
        try {
            api = await connectToMikrotik(ip, user, pass);
            await api.close();

            // Encriptamos la clave del router usando la Master Key del servidor (SQLite)
            const encPass = encryptPass(pass);
            
            // Generamos token inyectando el encPass de forma state-less
            const token = jwt.sign({ ip, user, encPass }, JWT_SECRET, { expiresIn: '24h' });

            res.json({
                success: true,
                message: 'Conectado exitosamente',
                token,
                user,
                ip
            });
        } catch (error) {
            if (api) try { await api.close(); } catch (_) { }
            console.error(`[AUTH] Login fallido para ${user}@${ip}: ${error.message}`);
            res.status(401).json({ success: false, message: getErrorMessage(error, ip, user) });
        }
    } catch (zodError) {
        res.status(400).json({ success: false, message: 'Datos de entrada inválidos', errors: zodError.errors });
    }
});

// Endpoint extra para chequear que la sesión en el JWT sigue válida (usado al refrescar la web)
router.get('/me', require('./auth.middleware').verifyToken, (req, res) => {
    res.json({ success: true, ip: req.mikrotik.ip, user: req.mikrotik.user });
});

module.exports = router;
