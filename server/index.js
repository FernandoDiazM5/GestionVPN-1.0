const express = require('express');
const cors = require('cors');
const http  = require('http');
const https = require('https');
const net   = require('net');
const { RouterOSAPI } = require('node-routeros');
const { Client: SSH2Client } = require('ssh2');

const app = express();
const PORT = process.env.PORT || 3001;

// node-routeros@1.6.9 lanza excepciones no capturables cuando RouterOS devuelve
// respuestas desconocidas como !empty (resultado vacío de filtro). Sin este guard,
// el proceso Node.js crashea completamente. Solo capturamos errores RouterOS (errno
// como string), dejando pasar errores del sistema (código numérico) para que Node
// los maneje normalmente (ej. EADDRINUSE al iniciar).
process.on('uncaughtException', (err) => {
    if (typeof err?.errno === 'string') {
        console.error('[WARN] Respuesta inesperada de RouterOS (no fatal):', err.message);
        return;
    }
    // Errores del sistema (errno numérico) — volver a lanzar para comportamiento normal
    throw err;
});

// CORS restringido a orígenes locales del frontend (dev y build local)
app.use(cors({
    origin: ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:4173', 'http://127.0.0.1:5173'],
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

// Regex de validación IPv4 básica (cuatro octetos 0-255)
const IPV4_REGEX = /^(25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)(\.(25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)){3}$/;

// Regex de validación CIDR (IPv4/prefijo 0-32)
const CIDR_REGEX = /^(25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)(\.(25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)){3}\/(3[0-2]|[1-2]\d|\d)$/;

// ─────────────────────────────────────────────
// Helpers para el módulo de dispositivos de red
// ─────────────────────────────────────────────

/** Verifica si una dirección IP pertenece a una subred CIDR. */
const isInSubnet = (ip, cidr) => {
    try {
        const [network, bits] = cidr.split('/');
        const maskBits = parseInt(bits, 10);
        if (isNaN(maskBits) || maskBits < 0 || maskBits > 32) return false;
        const toNum = addr => addr.split('.').reduce((acc, oct) => ((acc << 8) | parseInt(oct, 10)) >>> 0, 0);
        const mask = maskBits > 0 ? (~0 << (32 - maskBits)) >>> 0 : 0;
        return (toNum(ip) & mask) === (toNum(network) & mask);
    } catch { return false; }
};

/**
 * Genera todas las IPs de host en una subred CIDR (excluye dirección de red y broadcast).
 * Ej: 10.5.5.0/24 → ['10.5.5.1', '10.5.5.2', ..., '10.5.5.254']
 */
const getSubnetHosts = (cidr) => {
    const [network, bits] = cidr.split('/');
    const prefixLen = parseInt(bits, 10);
    const toNum = addr => addr.split('.').reduce((acc, oct) => ((acc << 8) | parseInt(oct, 10)) >>> 0, 0);
    const toIP  = num  => [24, 16, 8, 0].map(b => (num >>> b) & 0xff).join('.');
    const mask    = prefixLen > 0 ? (~0 << (32 - prefixLen)) >>> 0 : 0;
    const netBase = (toNum(network) & mask) >>> 0;
    const total   = 1 << (32 - prefixLen);
    const ips = [];
    for (let i = 1; i < total - 1; i++) {
        ips.push(toIP((netBase + i) >>> 0));
    }
    return ips;
};

/**
 * Sondea una IP buscando la página de estado de airOS Ubiquiti (/status.cgi).
 * Usa http.request nativo para evitar problemas con TLS, AbortController y versiones de Node.
 * Puerto 80 (HTTP) — más confiable que HTTPS con cert autofirmado en airOS.
 * @returns {Promise<Object|null>} Datos del dispositivo o null si no es Ubiquiti / no responde
 */
/**
 * Sondea /status.cgi en un puerto/protocolo dado y resuelve con los datos del dispositivo o null.
 */
const probeStatusCgi = (deviceIP, port, useHttps) => {
    return new Promise((resolve) => {
        const lib = useHttps ? https : http;
        const req = lib.request({
            hostname:           deviceIP,
            port,
            path:               '/status.cgi',
            method:             'GET',
            timeout:            2000,
            headers:            { Accept: 'application/json, */*', Connection: 'close' },
            rejectUnauthorized: false, // cert autofirmado en Ubiquiti
        }, (res) => {
            // Seguir redirecciones simples (ej: HTTP → HTTPS)
            if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
                return resolve(null); // la redirección la maneja probeUbiquiti intentando HTTPS
            }
            let body = '';
            res.on('data', chunk => { body += chunk; });
            res.on('end', () => {
                try {
                    const data = JSON.parse(body);
                    if (!data || !data.host || !data.host.devmodel) return resolve(null);
                    const h = data.host;
                    const w = data.wireless || {};
                    resolve({
                        ip:        deviceIP,
                        mac:       (h.macaddr  || '').toUpperCase(),
                        name:      h.hostname  || deviceIP,
                        model:     h.devmodel  || 'Unknown',
                        firmware:  h.fwversion || 'Unknown',
                        role:      (w.mode === 'master' || w.mode === 'ap') ? 'ap' : 'sta',
                        parentAp:  (w.remote && w.remote.hostname) || w.essid || '',
                        essid:     w.essid || '',
                        frequency: parseInt(w.frequency) || 0,
                    });
                } catch { resolve(null); }
            });
        });
        req.on('error',   () => resolve(null));
        req.on('timeout', () => { req.destroy(); resolve(null); });
        req.end();
    });
};

/**
 * Intenta detectar un Ubiquiti airOS en una IP.
 * Prueba HTTP:80 y HTTPS:443 en paralelo (firmware antiguo y nuevo).
 * Resuelve con los datos del primer puerto que responda, o null si ninguno.
 */

/**
 * Lee el banner SSH de una IP:puerto sin autenticarse.
 * Ubiquiti airOS usa dropbear — el banner contiene "dropbear".
 * @returns {Promise<string|null>}
 */
const getSSHBanner = (host, port = 22, timeout = 2000) => new Promise((resolve) => {
    const sock = new net.Socket();
    let banner = '';
    const timer = setTimeout(() => { sock.destroy(); resolve(null); }, timeout);
    sock.connect(port, host, () => {});
    sock.on('data', (data) => {
        banner += data.toString();
        clearTimeout(timer);
        sock.destroy();
        resolve(banner);
    });
    sock.on('error',   () => { clearTimeout(timer); resolve(null); });
    sock.on('timeout', () => { sock.destroy(); clearTimeout(timer); resolve(null); });
});

const probeUbiquiti = async (deviceIP) => {
    // Intento 1: HTTP:80 y HTTPS:443 en paralelo (/status.cgi sin auth)
    const [http80, https443] = await Promise.all([
        probeStatusCgi(deviceIP, 80,  false),
        probeStatusCgi(deviceIP, 443, true),
    ]);
    if (http80 || https443) return http80 || https443;

    // Intento 2: SSH banner — Ubiquiti airOS usa dropbear
    const banner = await getSSHBanner(deviceIP, 22, 2000);
    if (banner && banner.toLowerCase().includes('dropbear')) {
        return {
            ip:        deviceIP,
            mac:       '',
            name:      deviceIP,
            model:     'Ubiquiti airOS (SSH)',
            firmware:  'desconocido',
            role:      'sta',
            parent_ap: '',
            essid:     '',
            frequency: 0,
        };
    }

    return null;
};

/**
 * Ejecuta un comando en un dispositivo remoto via SSH.
 * Incluye algoritmos legacy para compatibilidad con Ubiquiti airOS (XW/XM firmware).
 */
const sshExec = (host, port, username, password, command) => {
    return new Promise((resolve, reject) => {
        const conn = new SSH2Client();
        let output = '';
        const globalTimer = setTimeout(() => {
            conn.destroy();
            reject(new Error('Tiempo de espera SSH agotado (10s)'));
        }, 10000);

        conn.on('ready', () => {
            conn.exec(command, (err, stream) => {
                if (err) { clearTimeout(globalTimer); conn.end(); return reject(err); }
                stream.on('data', data => { output += data.toString(); });
                stream.stderr.on('data', () => {});
                stream.on('close', () => { clearTimeout(globalTimer); conn.end(); resolve(output.trim()); });
            });
        });
        conn.on('error', err => { clearTimeout(globalTimer); reject(err); });
        conn.connect({
            host, port: port || 22, username, password, readyTimeout: 8000,
            algorithms: {
                kex:           ['ecdh-sha2-nistp256', 'diffie-hellman-group14-sha1', 'diffie-hellman-group1-sha1'],
                serverHostKey: ['ssh-rsa', 'ssh-dss', 'ecdsa-sha2-nistp256'],
                cipher:        ['aes128-ctr', 'aes256-ctr', 'aes128-cbc', '3des-cbc'],
                hmac:          ['hmac-sha1', 'hmac-sha2-256', 'hmac-md5'],
            },
        });
    });
};

/**
 * Parsea la salida JSON de 'mca-status' (Ubiquiti AirOS).
 * Normaliza tasas (bps → Mbps) y CCQ (0-1000 → 0-100%).
 */
const parseAirOSStats = (output) => {
    try {
        const data = JSON.parse(output);
        const w  = data.wireless || {};
        const am = data.airmax   || {};
        const toMbps = bps => bps ? Math.round(bps / 1_000_000) : null;
        const toCCQ  = raw => raw ? Math.round(raw / 10)         : null;
        return {
            signal:          w.signal      || w.rssi        || null,
            noiseFloor:      w.noisefloor  || w.noise_floor || null,
            ccq:             toCCQ(w.ccq),
            txRate:          toMbps(w.txrate  || w.tx_rate),
            rxRate:          toMbps(w.rxrate  || w.rx_rate),
            frequency:       parseInt(w.frequency) || null,
            distance:        w.ackdistance  || w.ack_distance || null,
            txPower:         w.txpower      || w.tx_power    || null,
            uptime:          data.uptime    || null,
            essid:           w.essid        || null,
            mode:            w.mode         || null,
            airmaxEnabled:   !!am.enabled,
            airmaxCapacity:  am.capacity    || null,
            airmaxQuality:   am.quality     || null,
            stations: (data.sta || []).map(s => ({
                mac:        (s.mac || '').toUpperCase(),
                signal:     s.signal     || s.rssi  || null,
                noiseFloor: s.noisefloor || null,
                ccq:        toCCQ(s.ccq),
                txRate:     toMbps(s.txrate || s.tx_rate),
                rxRate:     toMbps(s.rxrate || s.rx_rate),
                distance:   s.ackdistance || null,
                uptime:     s.uptime      || null,
            })),
        };
    } catch {
        // Fallback: intentar parsear formato key=value (airOS firmware antiguo)
        try {
            const kv = {};
            output.split('\n').forEach(line => {
                const eq = line.indexOf('=');
                if (eq > 0) kv[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
            });
            if (Object.keys(kv).length > 0) {
                const toMbps = v => v ? Math.round(parseInt(v) / 1_000_000) : null;
                const toCCQ  = v => v ? Math.round(parseInt(v) / 10)        : null;
                return {
                    signal:         parseInt(kv.signal     || kv.rssi)        || null,
                    noiseFloor:     parseInt(kv.noisefloor || kv.noise_floor) || null,
                    ccq:            toCCQ(kv.ccq),
                    txRate:         toMbps(kv.txrate  || kv.tx_rate),
                    rxRate:         toMbps(kv.rxrate  || kv.rx_rate),
                    frequency:      parseInt(kv.frequency) || null,
                    distance:       parseInt(kv.ackdistance || kv.ack_distance) || null,
                    txPower:        parseInt(kv.txpower || kv.tx_power) || null,
                    essid:          kv.essid || null,
                    mode:           kv.mode  || null,
                    airmaxEnabled:  kv['airmax.status'] === 'enabled' || undefined,
                    stations:       [],
                };
            }
        } catch { /* si también falla, caer al raw */ }
        return { raw: output.slice(0, 2000) };
    }
};

/**
 * Wrapper seguro sobre api.write() con timeout por operación.
 *
 * Problema: node-routeros@1.6.9 no maneja la respuesta !empty de RouterOS.
 * Cuando !empty llega, el uncaughtException handler lo descarta, pero la Promise
 * del api.write() queda PENDIENTE PARA SIEMPRE — el request handler nunca
 * recibe respuesta y el frontend agota su timeout (20s).
 *
 * Solución: Promise.race contra un timer de 6s. Si la Promise no resuelve
 * (porque !empty colgó el canal), el race rechaza con error claro en 6s
 * y el catch del endpoint cierra la conexión y responde al frontend.
 */
const safeWrite = (api, commands, timeoutMs = 6000) =>
    Promise.race([
        api.write(commands),
        new Promise((_, reject) =>
            setTimeout(
                () => reject(new Error('Sin respuesta del router (posible !empty — tabla vacía o filtro sin resultados)')),
                timeoutMs,
            )
        ),
    ]);

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
        const resource = await safeWrite(api, ['/system/resource/print']);
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
        const secrets = await safeWrite(api, ['/ppp/secret/print']);
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
        const activeConnections = await safeWrite(api, ['/ppp/active/print']);
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
// Con arquitectura VRF, el PPP secret NUNCA se toca — la torre
// gestiona su propia conexión. Solo habilitamos el SSTP binding
// si estaba deshabilitado, y devolvemos la IP de sesión activa.
// ─────────────────────────────────────────────
app.post('/api/interface/activate', async (req, res) => {
    const { ip, user, pass, vpnName, vpnService } = req.body;

    if (!vpnName || !vpnService) {
        return res.status(400).json({ success: false, message: 'Faltan parámetros (vpnName, vpnService)' });
    }

    let api;
    try {
        api = await connectToMikrotik(ip, user, pass);

        const bindingMenu = `/interface/${vpnService}-server`;
        const allIfaces = await safeWrite(api, [`${bindingMenu}/print`]);
        const existingIface = allIfaces.find(i => i.user === vpnName);

        if (existingIface?.['.id']) {
            const isDisabled = existingIface.disabled === 'true' || existingIface.disabled === true;
            if (isDisabled) {
                // Solo habilitamos si estaba explícitamente deshabilitado.
                // Si ya está activo NO hacemos enable (evita reset del binding y
                // la desconexión momentánea que colgaba las llamadas API siguientes).
                await safeWrite(api, [`${bindingMenu}/enable`, `=.id=${existingIface['.id']}`]);
            }
        } else {
            await safeWrite(api, [
                `${bindingMenu}/add`,
                `=name=${vpnService}-${vpnName}`,
                `=user=${vpnName}`,
            ]);
        }

        // Devolver IP de la sesión activa si ya está conectada
        const allActive = await safeWrite(api, ['/ppp/active/print']);
        const activeSession = allActive.find(s => s.name === vpnName);

        await api.close();
        res.json({ success: true, ip: activeSession?.address });

    } catch (error) {
        console.error('Error [activate]:', error.message);
        if (api) try { await api.close(); } catch (_) {}
        res.status(500).json({ success: false, message: error.message || 'Error activando interface' });
    }
});

// ─────────────────────────────────────────────
// POST /api/interface/deactivate
// Con arquitectura VRF, el PPP secret NO se deshabilita —
// deshabilitar el secret desconecta la torre y destruye
// la ruta en el VRF, bloqueando el acceso admin.
// Solo deshabilitamos el SSTP binding para impedir nuevas
// conexiones, sin afectar la sesión activa ni el secret.
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
        const allIfaces = await safeWrite(api, [`${bindingMenu}/print`]);
        const existingIface = allIfaces.find(i => i.user === vpnName);

        if (existingIface?.['.id']) {
            await safeWrite(api, [`${bindingMenu}/disable`, `=.id=${existingIface['.id']}`]);
        }

        await api.close();
        res.json({ success: true });

    } catch (error) {
        console.error('Error [deactivate]:', error.message);
        if (api) try { await api.close(); } catch (_) {}
        res.status(500).json({ success: false, message: error.message || 'Error desactivando interface' });
    }
});

// ─────────────────────────────────────────────
// POST /api/nodes
// Construye la lista enriquecida de nodos combinando
// PPP Secrets + IP VRFs + PPP Active Sessions.
// ─────────────────────────────────────────────
app.post('/api/nodes', async (req, res) => {
    const { ip, user, pass } = req.body;

    let api;
    try {
        api = await connectToMikrotik(ip, user, pass);

        // Consultas paralelas para máxima velocidad
        const [secrets, vrfs, active, sstpIfaces, routes] = await Promise.all([
            safeWrite(api, ['/ppp/secret/print']),
            safeWrite(api, ['/ip/vrf/print']),
            safeWrite(api, ['/ppp/active/print']),
            safeWrite(api, ['/interface/sstp-server/print']),
            safeWrite(api, ['/ip/route/print']),
        ]);

        await api.close();

        // Indexar VRFs por nombre de interfaz para búsqueda rápida
        // Ej: { "VPN-SSTP-ND1-HOUSENET": "VRF-ND1-HOUSENET" }
        const vrfByInterface = {};
        for (const vrf of vrfs) {
            const ifaces = (vrf.interfaces || '').split(',').map(s => s.trim());
            for (const iface of ifaces) {
                if (iface) vrfByInterface[iface] = vrf.name;
            }
        }

        // Indexar interfaces SSTP por usuario → nombre de interfaz
        // Ej: { "TorreHousenet": "VPN-SSTP-ND1-HOUSENET" }
        const sstpIfaceByUser = {};
        for (const iface of sstpIfaces) {
            if (iface.user && iface.name) {
                sstpIfaceByUser[iface.user] = iface.name;
            }
        }

        // Indexar sesiones activas por nombre de usuario
        const activeByName = {};
        for (const session of active) {
            if (session.name) {
                activeByName[session.name] = {
                    address: session.address || '',
                    uptime: session.uptime || '',
                };
            }
        }

        // Indexar primera ruta LAN por VRF (ignorando destinos /32 de túneles)
        const sysRoutesByVrf = {};
        for (const route of (routes || [])) {
            const table = route['routing-table'];
            const dst = route['dst-address'] || '';
            if (table && table !== 'main' && !dst.endsWith('/32')) {
                if (!sysRoutesByVrf[table]) {
                    sysRoutesByVrf[table] = dst;
                }
            }
        }

        // Construir nodos enriquecidos
        const nodes = secrets
            .filter(s => s.service === 'sstp')
            .map(secret => {
                const name = secret.name || 'Unknown';
                const session = activeByName[name];

                // Cadena de resolución VRF:
                // 1. PPP Secret user → SSTP interface name → VRF name
                const sstpIfaceName = sstpIfaceByUser[name] || '';
                const nombreVrf = vrfByInterface[sstpIfaceName] || '';

                // Extraer nombre amigable del nodo desde el comment o el nombre del secret
                const nombreNodo = (secret.comment || name)
                    .replace('Torre', '')
                    .replace('torre', '')
                    .replace(/-ND\d+/gi, '')
                    .trim() || name;

                // Definir segmento LAN: prefiere el definido en el secreto, sino la tabla de ruteo del VRF
                const segmentoLan = secret.routes || sysRoutesByVrf[nombreVrf] || '';

                return {
                    id: secret['.id'],
                    nombre_nodo: nombreNodo,
                    ppp_user: name,
                    segmento_lan: segmentoLan,
                    nombre_vrf: nombreVrf,
                    service: secret.service || 'sstp',
                    disabled: secret.disabled === 'true' || secret.disabled === true,
                    running: !!session,
                    ip_tunnel: session ? session.address : '',
                    uptime: session ? session.uptime : '',
                };
            });

        res.json(nodes);
    } catch (error) {
        console.error('Error [nodes]:', error.message);
        if (api) try { await api.close(); } catch (_) {}
        res.status(500).json({ success: false, message: getErrorMessage(error, ip, user) });
    }
});

/**
 * Limpia entradas de address-list "vpn-activa" y reglas mangle "WEB-ACCESS"
 * directamente via API sin depender de scripts en el router.
 * Imprime TODOS los registros y filtra en JS para evitar el bug !empty
 * de node-routeros cuando un filtro de API no devuelve resultados.
 *
 * @param {RouterOSAPI} api
 */
const cleanTunnelRules = async (api) => {
    // allSettled: si una tabla está vacía RouterOS devuelve !empty → node-routeros
    // cuelga la Promise → safeWrite la rechaza por timeout (3s).
    // allSettled captura ese rechazo y devuelve [] en vez de abortar todo.
    const [addrsResult, mangleResult] = await Promise.allSettled([
        safeWrite(api, ['/ip/firewall/address-list/print'], 3000),
        safeWrite(api, ['/ip/firewall/mangle/print'], 3000),
    ]);

    const allAddrs  = addrsResult.status  === 'fulfilled' ? addrsResult.value  : [];
    const allMangle = mangleResult.status === 'fulfilled' ? mangleResult.value : [];

    const removeOps = [
        ...allAddrs
            .filter(e => e.list === 'vpn-activa' && e['.id'])
            .map(e => safeWrite(api, ['/ip/firewall/address-list/remove', `=.id=${e['.id']}`])),
        ...allMangle
            .filter(e => e.comment === 'WEB-ACCESS' && e['.id'])
            .map(e => safeWrite(api, ['/ip/firewall/mangle/remove', `=.id=${e['.id']}`])),
    ];

    if (removeOps.length > 0) await Promise.allSettled(removeOps); // allSettled: tolerancia a fallo individual
};

// ─────────────────────────────────────────────
// POST /api/tunnel/activate
// Aplica directamente las reglas de firewall y mangle
// necesarias para redirigir el tráfico del admin al VRF
// del nodo seleccionado. Opera 100% via API sin scripts.
//
// Flujo de red:
//   Admin (tunnelIP) → [mangle prerouting: mark=targetVRF]
//   → Router usa tabla VRF → reenvía por SSTP del nodo
//   → [NAT masquerade out LIST-VPN-TOWERS] → LAN remota
// ─────────────────────────────────────────────
app.post('/api/tunnel/activate', async (req, res) => {
    const { ip, user, pass, tunnelIP, targetVRF } = req.body;

    if (!tunnelIP || !targetVRF) {
        return res.status(400).json({
            success: false,
            message: 'Faltan parámetros (tunnelIP y targetVRF son requeridos)',
        });
    }

    if (!IPV4_REGEX.test(tunnelIP)) {
        return res.status(400).json({
            success: false,
            message: `tunnelIP no es una dirección IPv4 válida: "${tunnelIP}"`,
        });
    }

    let api;
    try {
        api = await connectToMikrotik(ip, user, pass);

        // 1. Limpiar accesos previos (address-list vpn-activa + mangle WEB-ACCESS)
        await cleanTunnelRules(api);

        // Reconectar: cleanTunnelRules usa allSettled con safeWrite, y si alguna
        // tabla estaba vacía RouterOS devuelve !empty → node-routeros deja el
        // canal interno corrupto (tag huérfano). Cerrar y abrir conexión nueva
        // garantiza un socket limpio para las operaciones de escritura siguientes.
        try { await api.close(); } catch (_) {}
        api = await connectToMikrotik(ip, user, pass);

        // 2. Agregar IP del admin a la lista de permiso
        await safeWrite(api, [
            '/ip/firewall/address-list/add',
            '=list=vpn-activa',
            `=address=${tunnelIP}`,
            '=comment=User Access',
        ]);

        // 3. Crear marca de ruteo hacia el VRF del nodo seleccionado
        await safeWrite(api, [
            '/ip/firewall/mangle/add',
            '=chain=prerouting',
            `=src-address=${tunnelIP}`,
            '=dst-address-list=LIST-NET-REMOTE-TOWERS',
            '=action=mark-routing',
            `=new-routing-mark=${targetVRF}`,
            '=passthrough=yes',
            '=comment=WEB-ACCESS',
        ]);

        await api.close();
        console.log(`[TUNNEL] Activado: VRF=${targetVRF}, IP=${tunnelIP}`);
        res.json({ success: true, message: `Acceso abierto a ${targetVRF} para ${tunnelIP}` });

    } catch (error) {
        console.error('Error [tunnel/activate]:', error.message);
        if (api) try { await api.close(); } catch (_) {}
        res.status(500).json({ success: false, message: getErrorMessage(error, ip, user) });
    }
});

// ─────────────────────────────────────────────
// POST /api/tunnel/deactivate
// Elimina directamente las reglas de firewall y mangle
// creadas por /api/tunnel/activate. Opera 100% via API.
// ─────────────────────────────────────────────
app.post('/api/tunnel/deactivate', async (req, res) => {
    const { ip, user, pass } = req.body;

    let api;
    try {
        api = await connectToMikrotik(ip, user, pass);

        await cleanTunnelRules(api);

        await api.close();
        console.log('[TUNNEL] Todos los accesos revocados');
        res.json({ success: true, message: 'Todos los accesos han sido revocados' });

    } catch (error) {
        console.error('Error [tunnel/deactivate]:', error.message);
        if (api) try { await api.close(); } catch (_) {}
        res.status(500).json({ success: false, message: getErrorMessage(error, ip, user) });
    }
});

// ─────────────────────────────────────────────
// POST /api/node/provision
// Crea los 6 objetos MikroTik necesarios para un nodo VPN nuevo:
//   1. PPP Secret
//   2. SSTP Server Binding
//   3. VRF (sin interfaces — solo mangle routing)
//   4. Ruta estática en la tabla VRF
//   5. Address-list entry en LIST-NET-REMOTE-TOWERS
//   6. Interface-list member en LIST-VPN-TOWERS
// ─────────────────────────────────────────────
app.post('/api/node/provision', async (req, res) => {
    const {
        ip, user, pass,
        nodeNumber, nodeName,
        pppUser, pppPassword,
        lanSubnet, remoteAddress,
    } = req.body;

    // Validaciones básicas
    if (!nodeNumber || !nodeName || !pppUser || !pppPassword || !lanSubnet || !remoteAddress) {
        return res.status(400).json({
            success: false,
            message: 'Faltan campos requeridos para provisionar el nodo',
        });
    }

    // Nombres derivados
    const ifaceName = `VPN-SSTP-ND${nodeNumber}-${nodeName.toUpperCase()}`;
    const vrfName   = `VRF-ND${nodeNumber}-${nodeName.toUpperCase()}`;
    // "Torre{nodeName}" permite que /api/nodes extraiga el nombre amigable con el regex existente
    const comment   = `Torre${nodeName}`;

    // Validar formato de subred LAN y dirección remota del túnel
    if (!CIDR_REGEX.test(lanSubnet)) {
        return res.status(400).json({
            success: false,
            message: `lanSubnet no es un CIDR válido: "${lanSubnet}" (ej: 10.5.5.0/24)`,
        });
    }
    if (!IPV4_REGEX.test(remoteAddress)) {
        return res.status(400).json({
            success: false,
            message: `remoteAddress no es una IPv4 válida: "${remoteAddress}" (ej: 10.10.250.212)`,
        });
    }

    const steps = [];
    let api;
    try {
        api = await connectToMikrotik(ip, user, pass);

        // ── 1. PPP Secret ──
        await safeWrite(api, [
            '/ppp/secret/add',
            `=name=${pppUser}`,
            `=password=${pppPassword}`,
            '=service=sstp',
            '=profile=PROF-VPN-TOWERS',
            `=remote-address=${remoteAddress}`,
            `=comment=${comment}`,
        ]);
        steps.push({ step: 1, obj: 'PPP Secret', name: pppUser, status: 'ok' });

        // ── 2. SSTP Server Binding ──
        await safeWrite(api, [
            '/interface/sstp-server/add',
            `=name=${ifaceName}`,
            `=user=${pppUser}`,
        ]);
        steps.push({ step: 2, obj: 'SSTP Binding', name: ifaceName, status: 'ok' });

        // ── 3. VRF (sin interfaces — mangle-only) ──
        await safeWrite(api, [
            '/ip/vrf/add',
            `=name=${vrfName}`,
        ]);
        steps.push({ step: 3, obj: 'VRF', name: vrfName, status: 'ok' });

        // ── 4. Ruta estática en tabla VRF ──
        await safeWrite(api, [
            '/ip/route/add',
            `=dst-address=${lanSubnet}`,
            `=gateway=${remoteAddress}`,
            `=routing-table=${vrfName}`,
        ]);
        steps.push({ step: 4, obj: 'Static Route', name: `${lanSubnet} → ${remoteAddress} [${vrfName}]`, status: 'ok' });

        // ── 5. Address-list entry ──
        await safeWrite(api, [
            '/ip/firewall/address-list/add',
            '=list=LIST-NET-REMOTE-TOWERS',
            `=address=${lanSubnet}`,
            `=comment=LAN ${comment}`,
        ]);
        steps.push({ step: 5, obj: 'Address List', name: `LIST-NET-REMOTE-TOWERS ← ${lanSubnet}`, status: 'ok' });

        // ── 6. Interface-list member ──
        await safeWrite(api, [
            '/interface/list/member/add',
            `=interface=${ifaceName}`,
            '=list=LIST-VPN-TOWERS',
        ]);
        steps.push({ step: 6, obj: 'Interface List', name: `LIST-VPN-TOWERS ← ${ifaceName}`, status: 'ok' });

        await api.close();
        console.log(`[PROVISION] Nodo ${comment} (${nodeName}) creado exitosamente`);
        res.json({
            success: true,
            message: `Nodo ND${nodeNumber}-${nodeName} provisionado correctamente`,
            ifaceName,
            vrfName,
            steps,
        });

    } catch (error) {
        console.error('Error [node/provision]:', error.message);
        if (api) try { await api.close(); } catch (_) {}
        res.status(500).json({
            success: false,
            message: getErrorMessage(error, ip, user),
            steps,
            failedAt: steps.length + 1,
        });
    }
});

// ─────────────────────────────────────────────
// POST /api/node/script
// Genera un script RouterOS listo para pegar en el
// terminal del MikroTik remoto (la torre/nodo destino).
// ─────────────────────────────────────────────
app.post('/api/node/script', async (req, res) => {
    const {
        nodeName, pppUser, pppPassword,
        lanSubnet, serverPublicIP,
    } = req.body;

    if (!nodeName || !pppUser || !pppPassword || !lanSubnet || !serverPublicIP) {
        return res.status(400).json({
            success: false,
            message: 'Faltan campos para generar el script del nodo remoto',
        });
    }

    // Calcular gateway (primera IP usable) y pool DHCP de forma correcta para cualquier prefijo.
    // Ej: 10.1.1.0/24 → gw 10.1.1.1, pool 10.1.1.100-10.1.1.254
    // Ej: 192.168.1.128/25 → gw 192.168.1.129, pool 192.168.1.228-192.168.1.254 (no .100 que cae en otra subred)
    const [netAddr, mask] = lanSubnet.split('/');
    const maskBits = parseInt(mask, 10);
    const ipParts  = netAddr.split('.').map(Number);
    const ipNum    = ((ipParts[0] << 24) | (ipParts[1] << 16) | (ipParts[2] << 8) | ipParts[3]) >>> 0;
    const maskNum  = maskBits > 0 ? (~0 << (32 - maskBits)) >>> 0 : 0;
    const netBase  = (ipNum & maskNum) >>> 0;
    const gwNum    = (netBase + 1) >>> 0;
    const toOctets = n => [(n >>> 24) & 0xFF, (n >>> 16) & 0xFF, (n >>> 8) & 0xFF, n & 0xFF].join('.');
    const gatewayIP = toOctets(gwNum);
    const lanCIDR   = `${gatewayIP}/${mask}`;
    const poolStart = toOctets((netBase + 100) >>> 0);
    const poolEnd   = toOctets((netBase + 254) >>> 0);

    const script = `# ============================================
# Script de configuración para nodo: ${nodeName}
# Generado automáticamente por MikroTikVPN Manager
# Pegar en: System > Terminal del MikroTik remoto
# ============================================

# 1. Bridge para la LAN local
/interface bridge
add name=BR-LAN comment="Bridge LAN ${nodeName}"

# 2. Agregar puertos al bridge (ajustar según hardware)
/interface bridge port
add bridge=BR-LAN interface=ether2
add bridge=BR-LAN interface=ether3
add bridge=BR-LAN interface=ether4
add bridge=BR-LAN interface=ether5

# 3. IP de la LAN local
/ip address
add address=${lanCIDR} interface=BR-LAN network=${netAddr}

# 4. DHCP Server para la LAN (opcional)
/ip pool
add name=pool-lan ranges=${poolStart}-${poolEnd}
/ip dhcp-server
add address-pool=pool-lan interface=BR-LAN name=dhcp-lan disabled=no
/ip dhcp-server network
add address=${lanSubnet} gateway=${gatewayIP} dns-server=8.8.8.8,8.8.4.4

# 5. SSTP Client - Conexión al servidor central
/interface sstp-client
add name=sstp-out1 connect-to=${serverPublicIP}:443 user=${pppUser} \\
    password=${pppPassword} profile=default-encryption \\
    tls-version=only-1.2 authentication=mschap2 \\
    comment="VPN al Servidor Central"

# 6. NAT - Masquerade para salida a Internet
/ip firewall nat
add action=masquerade chain=srcnat out-interface=sstp-out1 comment="NAT VPN"

# 7. Ruta por defecto via VPN (si se desea que TODO salga por VPN)
# Descomentar la siguiente línea si el nodo no tiene Internet propio:
# /ip route add dst-address=0.0.0.0/0 gateway=sstp-out1

# 8. DNS
/ip dns
set servers=8.8.8.8,8.8.4.4 allow-remote-requests=yes

# ============================================
# FIN - Nodo ${nodeName} configurado
# Verificar: /interface sstp-client print
# ============================================
`;

    res.json({ success: true, script });
});

// ─────────────────────────────────────────────
// POST /api/node/scan-devices
// Descubre dispositivos Ubiquiti en una subred CIDR:
//   Genera todas las IPs de host y las sondea en paralelo vía HTTP → /status.cgi (airOS, sin auth).
//   El backend corre en la misma máquina con acceso local a la LAN (sin necesidad de túnel VRF).
// ─────────────────────────────────────────────
app.post('/api/node/scan-devices', async (req, res) => {
    const { nodeLan } = req.body;

    if (!nodeLan || !CIDR_REGEX.test(nodeLan)) {
        return res.status(400).json({ success: false, message: 'Falta nodeLan o formato CIDR inválido (ej: 10.5.5.0/24)' });
    }

    const prefixLen = parseInt(nodeLan.split('/')[1], 10);
    if (prefixLen < 16) {
        return res.status(400).json({ success: false, message: 'Subred demasiado grande. Usa /16 o más específico (ej: /24).' });
    }

    // Genera todas las IPs de host de la subred y las sondea DIRECTAMENTE desde el backend.
    // Esto funciona porque el backend corre en la misma máquina que tiene el túnel VPN activo,
    // por lo que Node.js usa las mismas rutas que el navegador del usuario.
    // NOTA: La tabla ARP del MikroTik hub NO contiene dispositivos de LANs remotas porque
    // están detrás de un túnel PPP (punto a punto, sin ARP). El método anterior era incorrecto.
    const hostIPs = getSubnetHosts(nodeLan);
    console.log(`[SCAN] Sondeando ${hostIPs.length} IPs en ${nodeLan} directo desde backend (sin RouterOS ARP)...`);

    try {
        // Sondear en lotes de 40 IPs — timeout 2s por sondeo, total ~14s para /24
        const BATCH = 40;
        const allResults = [];
        for (let i = 0; i < hostIPs.length; i += BATCH) {
            const batch = hostIPs.slice(i, i + BATCH);
            const batchResults = await Promise.allSettled(batch.map(devIP => probeUbiquiti(devIP)));
            allResults.push(...batchResults);
        }
        const probeResults = allResults;

        const devices = probeResults
            .filter(r => r.status === 'fulfilled' && r.value !== null)
            .map(r => r.value);

        console.log(`[SCAN] ${devices.length} Ubiquiti encontrados en ${nodeLan} (${hostIPs.length} IPs sondeadas)`);
        res.json({
            success: true,
            devices,
            allIPs:  devices.map(d => d.ip),
            scanned: hostIPs.length,
            debug:   `Escaneadas ${hostIPs.length} IPs en ${nodeLan} — ${devices.length} Ubiquiti airOS encontrados`,
        });
    } catch (error) {
        console.error('Error [scan-devices]:', error.message);
        res.status(500).json({ success: false, message: error.message || 'Error en el escaneo' });
    }
});

// ─────────────────────────────────────────────
// POST /api/device/antenna
// Estadísticas RF de un dispositivo Ubiquiti airOS via SSH.
// Ejecuta 'mca-status' (binario AirOS que devuelve JSON con signal, CCQ, tasas, AirMax).
// ─────────────────────────────────────────────
app.post('/api/device/antenna', async (req, res) => {
    const { deviceIP, deviceUser, devicePass, devicePort } = req.body;

    if (!deviceIP || !deviceUser || !devicePass) {
        return res.status(400).json({ success: false, message: 'Faltan parámetros: deviceIP, deviceUser y devicePass son requeridos' });
    }
    if (!IPV4_REGEX.test(deviceIP)) {
        return res.status(400).json({ success: false, message: `deviceIP no es una IPv4 válida: "${deviceIP}"` });
    }

    try {
        const port = parseInt(devicePort) || 22;
        console.log(`[ANTENNA] SSH → ${deviceIP}:${port} (${deviceUser})`);
        const output = await sshExec(deviceIP, port, deviceUser, devicePass, 'mca-status');
        const stats  = parseAirOSStats(output);
        res.json({ success: true, stats });
    } catch (error) {
        console.error('[ANTENNA] Error SSH:', error.message);
        const msg = /[Aa]uth|handshake/.test(error.message)
            ? `Credenciales SSH incorrectas para ${deviceIP}`
            : /timeout|timed/.test(error.message)
                ? `Tiempo de espera agotado conectando a ${deviceIP}`
                : /ECONNREFUSED/.test(error.message)
                    ? `SSH rechazado en ${deviceIP}:${devicePort || 22} — verifica que SSH esté habilitado`
                    : error.message || 'Error de conexión SSH';
        res.status(500).json({ success: false, message: msg });
    }
});

// ─────────────────────────────────────────────
// POST /api/device/wifi/get
// Obtiene configuración WiFi del router detrás de la antena via RouterOS API.
// Devuelve interfaces wireless, SSIDs y PSK de los perfiles de seguridad.
// ─────────────────────────────────────────────
app.post('/api/device/wifi/get', async (req, res) => {
    const { routerIP, routerUser, routerPass } = req.body;

    if (!routerIP || !routerUser) {
        return res.status(400).json({ success: false, message: 'Faltan parámetros: routerIP y routerUser son requeridos' });
    }

    let api;
    try {
        api = await connectToMikrotik(routerIP, routerUser, routerPass || '');

        const [ifaces, profiles] = await Promise.allSettled([
            safeWrite(api, ['/interface/wireless/print']),
            safeWrite(api, ['/interface/wireless/security-profiles/print']),
        ]);

        await api.close();

        const wifiIfaces = ifaces.status === 'fulfilled'
            ? ifaces.value.map(i => ({
                id:              i['.id'],
                name:            i.name       || '',
                ssid:            i.ssid       || '',
                mode:            i.mode       || '',
                band:            i.band       || '',
                frequency:       i.frequency  || '',
                txPower:         i['tx-power-mode'] || '',
                securityProfile: i['security-profile'] || 'default',
                disabled:        i.disabled === 'true' || i.disabled === true,
            }))
            : [];

        const secProfiles = profiles.status === 'fulfilled'
            ? profiles.value.map(p => ({
                id:      p['.id'],
                name:    p.name || 'default',
                wpa2Key: p['wpa2-pre-shared-key'] || '',
                mode:    p.mode || '',
            }))
            : [];

        console.log(`[WIFI/GET] ${routerIP}: ${wifiIfaces.length} interfaces, ${secProfiles.length} perfiles`);
        res.json({ success: true, interfaces: wifiIfaces, profiles: secProfiles });

    } catch (error) {
        console.error('Error [wifi/get]:', error.message);
        if (api) try { await api.close(); } catch (_) {}
        res.status(500).json({ success: false, message: getErrorMessage(error, routerIP, routerUser) });
    }
});

// ─────────────────────────────────────────────
// POST /api/device/wifi/set
// Modifica el SSID y/o la clave WPA2 de una interfaz wireless via RouterOS API.
// ─────────────────────────────────────────────
app.post('/api/device/wifi/set', async (req, res) => {
    const { routerIP, routerUser, routerPass, ifaceId, ssid, profileId, wpa2Key } = req.body;

    if (!routerIP || !routerUser || !ifaceId) {
        return res.status(400).json({ success: false, message: 'Faltan parámetros: routerIP, routerUser e ifaceId son requeridos' });
    }

    let api;
    try {
        api = await connectToMikrotik(routerIP, routerUser, routerPass || '');

        // Cambiar SSID si se proporcionó
        if (ssid !== undefined && ssid !== '') {
            await safeWrite(api, ['/interface/wireless/set', `=.id=${ifaceId}`, `=ssid=${ssid}`]);
        }

        // Cambiar clave WPA2 si se proporcionó
        if (profileId && wpa2Key !== undefined && wpa2Key !== '') {
            await safeWrite(api, [
                '/interface/wireless/security-profiles/set',
                `=.id=${profileId}`,
                `=wpa2-pre-shared-key=${wpa2Key}`,
            ]);
        }

        await api.close();
        console.log(`[WIFI/SET] ${routerIP}: iface=${ifaceId} ssid="${ssid}"`);
        res.json({ success: true, message: 'Configuración WiFi actualizada correctamente' });

    } catch (error) {
        console.error('Error [wifi/set]:', error.message);
        if (api) try { await api.close(); } catch (_) {}
        res.status(500).json({ success: false, message: getErrorMessage(error, routerIP, routerUser) });
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
