const { RouterOSAPI } = require('node-routeros');

const connectToMikrotik = async (host, user, password) => {
    // ── Intento 1: puerto 8728 (plain API) ──────────────────────────────────
    try {
        const api = new RouterOSAPI({ host, user, password, port: 8728, timeout: 8, keepalive: false });
        await api.connect();
        console.log(`[CONN] Conectado a ${host}:8728 (plain)`);
        return api;
    } catch (err) {
        const errno = err?.errno;
        const code = err?.code;
        // Solo reintentamos en ECONNREFUSED (puerto cerrado activamente).
        // Si el puerto está filtrado/firewall (SOCKTMOUT/ETIMEDOUT), ambos puertos
        // tendrán el mismo problema y no tiene sentido esperar 8s extra en 8729.
        if (errno !== -4078 && code !== 'ECONNREFUSED') throw err;
        console.log(`[CONN] 8728 rechazado (ECONNREFUSED), reintentando con SSL 8729...`);
    }
    // ── Intento 2: puerto 8729 (SSL API) — solo si 8728 fue rechazado activamente ─
    try {
        const api = new RouterOSAPI({ host, user, password, port: 8729, tls: { rejectUnauthorized: false }, timeout: 8, keepalive: false });
        await api.connect();
        console.log(`[CONN] Conectado a ${host}:8729 (SSL)`);
        return api;
    } catch (err) {
        throw err;
    }
};

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

const getErrorMessage = (error, ip, user = '') => {
    const errno = error?.errno;
    const code = error?.code;
    const msg = error?.message || '';
    const msgLc = msg.toLowerCase();

    // ── Conectividad rechazada ───────────────────────────────────────────────
    if (errno === -4078 || code === 'ECONNREFUSED' || msgLc.includes('connection refused'))
        return `Puerto API rechazado en ${ip} — verifica que la API esté habilitada en MikroTik (IP Services > api / api-ssl)`;

    // ── Timeout (OS o librería) ──────────────────────────────────────────────
    if (errno === -4039 || errno === 'SOCKTMOUT' || code === 'ETIMEDOUT' ||
        error?.name === 'TimeoutError' || msgLc.includes('timed out'))
        return `Tiempo de espera agotado conectando a ${ip} — verifica que la IP sea correcta y el router sea accesible`;

    // ── Host no encontrado ───────────────────────────────────────────────────
    if (code === 'ENOTFOUND' || code === 'EHOSTUNREACH' || code === 'ENETUNREACH')
        return `No se puede alcanzar ${ip} — verifica la IP y la conectividad de red (WireGuard activo?)`;

    // ── Credenciales incorrectas (BUG FIX: strings corregidos según la librería) ──
    if (errno === 'CANTLOGIN' ||
        msgLc.includes('username or password is invalid') ||
        msgLc.includes('cannot log in') ||
        msgLc.includes('cantlogin') ||
        msgLc.includes('invalid user name or password'))
        return `Credenciales incorrectas para el usuario "${user}" en ${ip}`;

    return msg || `Error de conexión al router (${error?.name || 'desconocido'})`;
};

/**
 * cleanTunnelRules — Elimina entradas de vpn-activa y mangle WEB-ACCESS.
 *
 * Si se pasa `tunnelIP`, solo elimina las entradas correspondientes a esa IP,
 * preservando entradas de otros usuarios o entradas permanentes.
 * Si `tunnelIP` es null/undefined, comportamiento anterior: elimina TODAS
 * (solo mantener para compatibilidad; preferir siempre pasar tunnelIP).
 *
 * @param {object} api - Instancia de RouterOSAPI conectada
 * @param {string|null} tunnelIP - IP del túnel a limpiar, ej: "10.10.0.5"
 */
const cleanTunnelRules = async (api, tunnelIP) => {
    // SECUENCIAL — RouterOS no soporta comandos paralelos en la misma conexión
    const allAddrs = await safeWrite(api, ['/ip/firewall/address-list/print']).catch(() => []);
    const allMangle = await safeWrite(api, ['/ip/firewall/mangle/print']).catch(() => []);

    // Si se especifica tunnelIP, filtrar solo esa IP; si no, comportamiento legacy (todas)
    const addrFilter = tunnelIP
        ? (e) => e.list === 'vpn-activa' && e.address === tunnelIP && e['.id']
        : (e) => e.list === 'vpn-activa' && e['.id'];
    const mangleFilter = tunnelIP
        ? (e) => e.comment === 'ACCESO-DINAMICO' && e['.id']
        : (e) => e.comment === 'ACCESO-DINAMICO' && e['.id'];

    // Eliminar address-list entries secuencialmente
    for (const e of allAddrs.filter(addrFilter)) {
        await safeWrite(api, ['/ip/firewall/address-list/remove', `=.id=${e['.id']}`]).catch(() => { });
    }
    // Eliminar mangle entries secuencialmente
    for (const e of allMangle.filter(mangleFilter)) {
        await safeWrite(api, ['/ip/firewall/mangle/remove', `=.id=${e['.id']}`]).catch(() => { });
    }
};

/**
 * writeIdempotent — Ejecuta un comando /add en MikroTik ignorando errores de duplicado.
 * RouterOS lanza errores como "already have", "entry already exists", "failure: already have such"
 * cuando el recurso ya existe. Esta función los ignora para ser idempotente.
 */
const writeIdempotent = async (api, commands, timeoutMs = 8000) => {
    try {
        return await Promise.race([
            api.write(commands),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Timeout en writeIdempotent')), timeoutMs)
            ),
        ]);
    } catch (err) {
        const msg = (err?.message || '').toLowerCase();
        // Errores conocidos de duplicado en RouterOS — safe to ignore
        if (msg.includes('already have') ||
            msg.includes('entry already exists') ||
            msg.includes('already exists') ||
            msg.includes('failure: already')) {
            console.log(`[writeIdempotent] Recurso ya existe (ignorado): ${commands[0]}`);
            return [];
        }
        throw err;
    }
};

/**
 * parseHandshakeSecs — Convierte el campo last-handshake de RouterOS a segundos.
 * Formatos posibles: "1m30s", "45s", "2h5m", "" (nunca conectado → Infinity).
 */
const parseHandshakeSecs = (str) => {
    if (!str || str.trim() === '') return Infinity;
    let total = 0;
    const h = str.match(/(\d+)h/); if (h) total += parseInt(h[1]) * 3600;
    const m = str.match(/(\d+)m/); if (m) total += parseInt(m[1]) * 60;
    const s = str.match(/(\d+)s/); if (s) total += parseInt(s[1]);
    return total || Infinity;
};

module.exports = { connectToMikrotik, safeWrite, getErrorMessage, cleanTunnelRules, writeIdempotent, parseHandshakeSecs };
