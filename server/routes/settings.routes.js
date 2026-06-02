const express = require('express');
const router = express.Router();
const { Worker } = require('worker_threads');
const path = require('path');
const { connectToMikrotik, safeWrite, getErrorMessage, cleanTunnelRules } = require('../routeros.service');
const { IPV4_REGEX, CIDR_REGEX, getSubnetHosts, probeUbiquiti, sshExec, parseAirOSStats, parseFullOutput, ANTENNA_CMD, trySshCredentials } = require('../ubiquiti.service');
const { getDb, encryptDevice, decryptDevice, encryptPass, decryptPass, saveNode, getNodes, deleteNode } = require('../db.service');

// Credenciales del router core (MikroTik compartido). Son infraestructura de
// plataforma: solo el Administrador (platform_admin) puede verlas/editarlas.
// El resto de claves (server_public_ip, wg_endpoint_ip, etc.) son operativas
// y las usan los moderadores en Nodos/Usuarios.
const CORE_ROUTER_KEYS = ['MT_IP', 'MT_USER', 'MT_PASS'];

router.get('/settings/get', async (req, res) => {
    try {
        const db = await getDb();
        const isPlatformAdmin = !!req.account?.platform_admin;
        const rows = await db.all('SELECT `key`, value FROM app_settings');
        const settings = {};
        rows.forEach(r => {
            // Ocultar las credenciales del router a quien no sea Administrador
            if (!isPlatformAdmin && CORE_ROUTER_KEYS.includes(r.key)) return;
            if (r.key === 'MT_PASS' && r.value) {
                settings[r.key] = '********';
            } else {
                settings[r.key] = r.value;
            }
        });
        res.json({ success: true, settings });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

const requireAdmin = (req, res, next) => {
    if (req.user?.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Acceso denegado — se requiere rol admin' });
    }
    next();
};

router.post('/settings/save', requireAdmin, async (req, res) => {
    const { key, value } = req.body;
    if (!key) return res.status(400).json({ success: false, message: 'key requerido' });
    // La configuración del router core solo la modifica el Administrador de plataforma
    if (CORE_ROUTER_KEYS.includes(key) && !req.account?.platform_admin) {
        return res.status(403).json({ success: false, message: 'Solo el Administrador puede modificar la configuración del router core.' });
    }
    try {
        const db = await getDb();
        let finalValue = value ?? '';

        if (key === 'MT_PASS') {
            if (finalValue === '********') return res.json({ success: true });
            if (finalValue) finalValue = encryptPass(finalValue);
        }

        await db.run('INSERT INTO app_settings (`key`, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(`key`) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
            [key, finalValue, Date.now()]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
