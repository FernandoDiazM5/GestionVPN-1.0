const express = require('express');
const cors = require('cors');
const { RouterOSAPI } = require('node-routeros');

const app = express();
const PORT = process.env.PORT || 3001;

// CORS restringido a orígenes locales del frontend (dev y build local)
app.use(cors({
    origin: ['http://localhost:5173', 'http://localhost:4173', 'http://127.0.0.1:5173'],
    methods: ['POST'],
    allowedHeaders: ['Content-Type'],
}));
app.use(express.json());

/**
 * Conecta al RouterOS via node-routeros.
 * Intenta puerto 8728 (plain-text) primero.
 * Si ECONNREFUSED, reintenta en 8729 (SSL/TLS).
 * Retorna la instancia api ya autenticada.
 *
 * @param {string} host
 * @param {string} user
 * @param {string} password
 * @returns {Promise<RouterOSAPI>}
 */
const connectToMikrotik = async (host, user, password) => {
    // Intento 1: Puerto 8728 plain-text
    try {
        const api = new RouterOSAPI({
            host,
            user,
            password,
            port: 8728,
            timeout: 8,
            keepalive: false,
        });
        await api.connect();
        console.log(`[CONN] Conectado a ${host}:8728 (plain)`);
        return api;
    } catch (err) {
        // Solo reintentamos si el puerto está cerrado (ECONNREFUSED)
        if (err?.errno !== -4078 && err?.code !== 'ECONNREFUSED') throw err;
        console.log(`[CONN] 8728 rechazado, reintentando con SSL en 8729...`);
    }

    // Intento 2: Puerto 8729 SSL/TLS
    // rejectUnauthorized: false — MikroTik usa certificado autofirmado (no CA confiable)
    const api = new RouterOSAPI({
        host,
        user,
        password,
        port: 8729,
        tls: { rejectUnauthorized: false },
        timeout: 8,
        keepalive: false,
    });
    await api.connect();
    console.log(`[CONN] Conectado a ${host}:8729 (SSL)`);
    return api;
};

/**
 * Normaliza errores de RouterOS/red en mensajes legibles para el usuario.
 * Los detalles técnicos (errno, stack) quedan solo en consola.
 *
 * @param {Error} error
 * @param {string} ip
 * @param {string} user
 * @returns {string}
 */
const getErrorMessage = (error, ip, user = '') => {
    const errno = error?.errno;
    const code  = error?.code;
    const msg   = error?.message || '';

    if (errno === -4078 || code === 'ECONNREFUSED') {
        return `Puerto API rechazado en ${ip} — verifica que la API esté habilitada en el MikroTik (IP Services > api)`;
    }
    if (errno === -4039 || code === 'ETIMEDOUT' || error?.name === 'TimeoutError') {
        return `Tiempo de espera agotado conectando a ${ip} — verifica que la IP sea correcta y el router sea accesible`;
    }
    if (msg.toLowerCase().includes('cannot log in') || msg.includes('CANTLOGIN') || msg.includes('invalid user name or password')) {
        return `Credenciales incorrectas para el usuario "${user}" en ${ip}`;
    }
    return msg || `Error de conexión al router (${error?.name || 'desconocido'})`;
};

// ─────────────────────────────────────────────
// POST /api/connect
// Valida las credenciales realizando un login real al router.
// ─────────────────────────────────────────────
app.post('/api/connect', async (req, res) => {
    const { ip, user, pass } = req.body;

    if (!ip || !user) {
        return res.status(400).json({ success: false, message: 'Faltan credenciales (ip y user son requeridos)' });
    }

    let api;
    try {
        api = await connectToMikrotik(ip, user, pass);

        // Ejecuta un comando inocuo para confirmar que la sesión es válida
        const resource = await api.write(['/system/resource/print']);
        await api.close();

        res.json({ success: true, message: 'Conectado exitosamente', data: resource });
    } catch (error) {
        console.error('Error [connect]:', error);
        if (api) try { await api.close(); } catch (_) {}
        res.status(500).json({ success: false, message: getErrorMessage(error, ip, user) });
    }
});

// ─────────────────────────────────────────────
// POST /api/secrets
// Obtiene la lista completa de PPP Secrets configurados en el router.
// ─────────────────────────────────────────────
app.post('/api/secrets', async (req, res) => {
    const { ip, user, pass } = req.body;

    let api;
    try {
        api = await connectToMikrotik(ip, user, pass);
        const secrets = await api.write(['/ppp/secret/print']);
        await api.close();

        // node-routeros siempre expone el ID como '.id' (con punto)
        const mappedSecrets = secrets.map(item => ({
            id:       item['.id'],
            name:     item.name     || 'Unknown',
            service:  item.service  || 'any',
            profile:  item.profile  || 'default',
            disabled: item.disabled === 'true' || item.disabled === true,
            running:  false,
        }));

        res.json(mappedSecrets);
    } catch (error) {
        console.error('Error [secrets]:', error.message);
        if (api) try { await api.close(); } catch (_) {}
        res.status(500).json({ success: false, message: error.message || 'Error al obtener secretos del MikroTik' });
    }
});

// ─────────────────────────────────────────────
// POST /api/active
// Obtiene las sesiones PPP actualmente activas/corriendo.
// ─────────────────────────────────────────────
app.post('/api/active', async (req, res) => {
    const { ip, user, pass } = req.body;

    let api;
    try {
        api = await connectToMikrotik(ip, user, pass);
        const activeConnections = await api.write(['/ppp/active/print']);
        await api.close();

        const mappedActive = activeConnections.map(item => ({
            name:    item.name    || 'Unknown',
            service: item.service || 'any',
            address: item.address || '',
            uptime:  item.uptime  || '',
        }));

        res.json(mappedActive);
    } catch (error) {
        console.error('Error [active]:', error.message);
        if (api) try { await api.close(); } catch (_) {}
        res.status(500).json({ success: false, message: error.message || 'Error al obtener conexiones activas' });
    }
});

// ─────────────────────────────────────────────
// POST /api/interface/activate
// Habilita el PPP Secret y crea el Server Binding de interfaz.
// ─────────────────────────────────────────────
app.post('/api/interface/activate', async (req, res) => {
    const { ip, user, pass, vpnName, vpnService } = req.body;

    if (!vpnName || !vpnService) {
        return res.status(400).json({ success: false, message: 'Faltan parámetros (vpnName, vpnService)' });
    }

    let api;
    try {
        api = await connectToMikrotik(ip, user, pass);

        // 1. Habilitamos el PPP Secret filtrando por nombre
        await api.write(['/ppp/secret/enable', `?name=${vpnName}`]);

        // 2. Creamos el Interface Server Binding solo si no existe ya
        const bindingMenu = `/interface/${vpnService}-server`;
        const existingIfaces = await api.write([`${bindingMenu}/print`, `?user=${vpnName}`]);
        if (existingIfaces.length === 0) {
            await api.write([
                `${bindingMenu}/add`,
                `=name=<${vpnService}-${vpnName}>`,
                `=user=${vpnName}`,
            ]);
        }

        // 3. Consultamos si ya hay sesión activa para devolver la IP asignada
        let activeIp;
        try {
            const activeList = await api.write(['/ppp/active/print', `?name=${vpnName}`]);
            if (activeList.length > 0 && activeList[0].address) {
                activeIp = activeList[0].address;
            }
        } catch (_) { /* sesión aún no establecida — no es un error */ }

        await api.close();
        res.json({ success: true, ip: activeIp });

    } catch (error) {
        console.error('Error [activate]:', error.message);
        if (api) try { await api.close(); } catch (_) {}
        res.status(500).json({ success: false, message: error.message || 'Error activando interface' });
    }
});

// ─────────────────────────────────────────────
// POST /api/interface/deactivate
// Remueve el Server Binding y deshabilita el PPP Secret.
// ─────────────────────────────────────────────
app.post('/api/interface/deactivate', async (req, res) => {
    const { ip, user, pass, vpnName, vpnService } = req.body;

    if (!vpnName || !vpnService) {
        return res.status(400).json({ success: false, message: 'Faltan parámetros (vpnName, vpnService)' });
    }

    let api;
    try {
        api = await connectToMikrotik(ip, user, pass);

        const bindingMenu = `/interface/${vpnService}-server`;

        // 1. Buscamos el binding por usuario y lo removemos por su .id
        try {
            const existingIfaces = await api.write([`${bindingMenu}/print`, `?user=${vpnName}`]);
            if (existingIfaces.length > 0) {
                const bindingId = existingIfaces[0]['.id'];
                await api.write([`${bindingMenu}/remove`, `=.id=${bindingId}`]);
            }
        } catch (e) {
            console.log(`[DEACTIVATE] Binding para "${vpnName}" no encontrado o ya removido`);
        }

        // 2. Deshabilitamos el PPP Secret filtrando por nombre
        await api.write(['/ppp/secret/disable', `?name=${vpnName}`]);

        await api.close();
        res.json({ success: true });

    } catch (error) {
        console.error('Error [deactivate]:', error.message);
        if (api) try { await api.close(); } catch (_) {}
        res.status(500).json({ success: false, message: error.message || 'Error desactivando interface' });
    }
});

// Levanta el servidor Express
app.listen(PORT, () => {
    console.log(`\n==============================================`);
    console.log(`  Servidor Backend MikroTik API Proxy`);
    console.log(`  http://localhost:${PORT}`);
    console.log(`  Usando node-routeros (API nativa RouterOS)`);
    console.log(`==============================================\n`);
});
