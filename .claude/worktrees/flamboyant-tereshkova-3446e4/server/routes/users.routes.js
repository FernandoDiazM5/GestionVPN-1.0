const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { getDb } = require('../db.service');
const { z } = require('zod');

// Middleware para restringir a ADMINS
router.use((req, res, next) => {
    if (req.user?.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Permisos insuficientes. Sólo administradores pueden gestionar el personal.' });
    }
    next();
});

const userSchema = z.object({
    username: z.string().min(1, 'El nombre de usuario es obligatorio').regex(/^[a-zA-Z0-9_-]+$/, 'Usuario sólo puede contener letras, números, guiones y guiones bajos'),
    password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres').optional(),
    role: z.enum(['admin', 'operator', 'viewer'], { errorMap: () => ({ message: 'El rol debe ser admin, operator o viewer' }) })
});

// GET /api/users/list -> Obtener todos (sin hash)
router.get('/list', async (req, res) => {
    try {
        const db = await getDb();
        const users = await db.all('SELECT id, username, role, created_at FROM vpn_users ORDER BY username ASC');
        res.json({ success: true, users });
    } catch(e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// POST /api/users/add -> Crear usuario
router.post('/add', async (req, res) => {
    try {
        const { username, password, role } = userSchema.parse(req.body);
        if (!password) {
            return res.status(400).json({ success: false, message: 'La contraseña es obligatoria para usuarios nuevos.' });
        }

        const db = await getDb();
        
        // Verificar existencia
        const check = await db.get('SELECT id FROM vpn_users WHERE username = ?', [username]);
        if (check) return res.status(400).json({ success: false, message: 'El nombre de usuario ya está en uso' });

        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(password, salt);

        await db.run('INSERT INTO vpn_users (username, password_hash, role, created_at) VALUES (?, ?, ?, ?)',
            [username, hash, role, Date.now()]);
            
        res.json({ success: true, message: 'Miembro del personal creado exitosamente' });
    } catch(e) {
        if (e.errors) return res.status(400).json({ success: false, message: 'Datos inválidos', errors: e.errors });
        res.status(500).json({ success: false, message: e.message });
    }
});

// POST /api/users/edit -> Editar usuario
router.post('/edit', async (req, res) => {
    try {
        const { id, username, password, role } = req.body;
        // Validar username (ignoramos el parse standard para permitir actualizaciones parciales)
        if (!id || !username || !role) return res.status(400).json({ success: false, message: 'Datos incompletos' });

        const db = await getDb();
        
        // Evitar que el último admin se quite su rol o se borre (podemos asumir que uno no debería auto-rebajarse si es el único admin)
        const admins = await db.all('SELECT id FROM vpn_users WHERE role = "admin"');
        if (role !== 'admin' && admins.length === 1 && admins[0].id == id) {
            return res.status(400).json({ success: false, message: 'No puedes degradar al último administrador del sistema.' });
        }

        if (password && password.length >= 6) {
            const salt = await bcrypt.genSalt(10);
            const hash = await bcrypt.hash(password, salt);
            await db.run('UPDATE vpn_users SET username = ?, role = ?, password_hash = ?, updated_at = ? WHERE id = ?',
                [username, role, hash, Date.now(), id]);
        } else {
            await db.run('UPDATE vpn_users SET username = ?, role = ?, updated_at = ? WHERE id = ?',
                [username, role, Date.now(), id]);
        }
            
        res.json({ success: true, message: 'Miembro actualizado exitosamente' });
    } catch(e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// POST /api/users/delete -> Borrar usuario
router.post('/delete', async (req, res) => {
    try {
        const { id } = req.body;
        if (!id) return res.status(400).json({ success: false, message: 'ID requerido' });
        
        const db = await getDb();
        
        const target = await db.get('SELECT role FROM vpn_users WHERE id = ?', [id]);
        if (!target) return res.status(404).json({ success: false, message: 'Usuario no encontrado' });

        if (req.user.username === req.body.username || req.user.id == id) {
            return res.status(400).json({ success: false, message: 'No puedes borrarte a ti mismo.' });
        }

        const admins = await db.all('SELECT id FROM vpn_users WHERE role = "admin"');
        if (target.role === 'admin' && admins.length === 1) {
            return res.status(400).json({ success: false, message: 'No puedes borrar al último administrador del sistema.' });
        }

        await db.run('DELETE FROM vpn_users WHERE id = ?', [id]);
        res.json({ success: true, message: 'Miembro borrado permanentemente' });
    } catch(e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

module.exports = router;
