const express = require('express');
const router = express.Router();
const { Worker } = require('worker_threads');
const path = require('path');
const { connectToMikrotik, safeWrite, getErrorMessage, cleanTunnelRules } = require('../routeros.service');
const { IPV4_REGEX, CIDR_REGEX, getSubnetHosts, probeUbiquiti, sshExec, parseAirOSStats, parseFullOutput, ANTENNA_CMD, trySshCredentials } = require('../ubiquiti.service');
const { getDb, encryptDevice, decryptDevice, encryptPass, decryptPass, saveNode, getNodes, deleteNode } = require('../db.service');

router.get('/settings/get', async (req, res) => {
    try {
        const db = await getDb();
        const rows = await db.all('SELECT key, value FROM app_settings');
        const settings = {};
        rows.forEach(r => { 
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
    try {
        const db = await getDb();
        let finalValue = value ?? '';
        
        if (key === 'MT_PASS') {
            if (finalValue === '********') return res.json({ success: true });
            if (finalValue) finalValue = encryptPass(finalValue);
        }

        await db.run('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
            [key, finalValue]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
