const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const bcrypt = require('bcryptjs');
const { hasUsers, getUserByUsername, createUser } = require('./db.service');
const { JWT_SECRET } = require('./auth.middleware');

const loginSchema = z.object({
    username: z.string().min(1, "El usuario es requerido"),
    password: z.string().min(1, "La contraseña es requerida")
});

const setupSchema = z.object({
    username: z.string().min(1),
    password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres")
});

// Endpoint para estado inicial (saber si hay que mostrar pantalla de Setup o Login)
router.get('/status', async (req, res) => {
    try {
        const configured = await hasUsers();
        res.json({ success: true, needsSetup: !configured });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// Endpoint de Setup inicial (sólo funciona si no hay usuarios)
router.post('/setup', async (req, res) => {
    try {
        const configured = await hasUsers();
        if (configured) {
            return res.status(403).json({ success: false, message: 'La aplicación ya fue inicializada. Inicie sesión.' });
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

        res.json({
            success: true,
            message: 'Administrador creado y logueado exitosamente',
            token,
            user: username,
            role: 'admin'
        });
    } catch (error) {
        if (error.errors) return res.status(400).json({ success: false, message: 'Datos inválidos', errors: error.errors });
        res.status(500).json({ success: false, message: error.message });
    }
});

router.post('/login', async (req, res) => {
    try {
        const { username, password } = loginSchema.parse(req.body);

        const configured = await hasUsers();
        if (!configured) {
            return res.status(400).json({ success: false, message: 'La aplicación no ha sido inicializada. Vaya a /setup' });
        }

        const row = await getUserByUsername(username);
        if (!row) {
            return res.status(401).json({ success: false, message: 'Usuario o contraseña incorrectos' });
        }

        const passMatch = await bcrypt.compare(password, row.password_hash);
        if (!passMatch) {
            return res.status(401).json({ success: false, message: 'Usuario o contraseña incorrectos' });
        }

        const token = jwt.sign({ id: row.id, username: row.username, role: row.role }, JWT_SECRET, { expiresIn: '24h' });

        res.json({
            success: true,
            message: 'Conectado exitosamente',
            token,
            user: row.username,
            role: row.role
        });
    } catch (zodError) {
        res.status(400).json({ success: false, message: 'Datos de entrada inválidos', errors: zodError.errors });
    }
});

// Obtener datos del JWT activo
router.get('/me', require('./auth.middleware').verifyToken, (req, res) => {
    res.json({ success: true, user: req.user.username, role: req.user.role });
});

// Refresh token — emite un nuevo JWT si el actual es válido
router.post('/refresh', (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, message: 'Token requerido' });
    }
    try {
        const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
        const token = jwt.sign(
            { id: decoded.id, username: decoded.username, role: decoded.role },
            JWT_SECRET,
            { expiresIn: '24h' }
        );
        res.json({ success: true, token, expiresIn: 86400 });
    } catch {
        res.status(403).json({ success: false, message: 'Token inválido o expirado' });
    }
});

module.exports = router;
