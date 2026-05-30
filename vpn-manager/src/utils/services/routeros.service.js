const { RouterOSAPI } = require('node-routeros');

const connectToMikrotik = async (host, user, password) => {
    try {
        const api = new RouterOSAPI({ host, user, password, port: 8728, timeout: 8, keepalive: false });
        await api.connect();
        console.log(`[CONN] Conectado a ${host}:8728 (plain)`);
        return api;
    } catch (err) {
        if (err?.errno !== -4078 && err?.code !== 'ECONNREFUSED') throw err;
        console.log(`[CONN] 8728 rechazado, reintentando con SSL en 8729...`);
    }
    const api = new RouterOSAPI({ host, user, password, port: 8729, tls: { rejectUnauthorized: false }, timeout: 8, keepalive: false });
    await api.connect();
    console.log(`[CONN] Conectado a ${host}:8729 (SSL)`);
    return api;
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
    if (errno === -4078 || code === 'ECONNREFUSED') return `Puerto API rechazado en ${ip} — verifica que la API esté habilitada en el MikroTik (IP Services > api)`;
    if (errno === -4039 || code === 'ETIMEDOUT' || error?.name === 'TimeoutError') return `Tiempo de espera agotado conectando a ${ip} — verifica que la IP sea correcta y el router sea accesible`;
    if (msg.toLowerCase().includes('cannot log in') || msg.includes('CANTLOGIN') || msg.includes('invalid user name or password')) return `Credenciales incorrectas para el usuario "${user}" en ${ip}`;
    return msg || `Error de conexión al router (${error?.name || 'desconocido'})`;
};

const cleanTunnelRules = async (api) => {
    const [addrsResult, mangleResult] = await Promise.allSettled([
        safeWrite(api, ['/ip/firewall/address-list/print'], 3000),
        safeWrite(api, ['/ip/firewall/mangle/print'], 3000),
    ]);
    const allAddrs = addrsResult.status === 'fulfilled' ? addrsResult.value : [];
    const allMangle = mangleResult.status === 'fulfilled' ? mangleResult.value : [];

    const removeOps = [
        ...allAddrs.filter(e => e.list === 'vpn-activa' && e['.id'])
            .map(e => safeWrite(api, ['/ip/firewall/address-list/remove', `=.id=${e['.id']}`])),
        ...allMangle.filter(e => e.comment === 'WEB-ACCESS' && e['.id'])
            .map(e => safeWrite(api, ['/ip/firewall/mangle/remove', `=.id=${e['.id']}`])),
    ];

    if (removeOps.length > 0) await Promise.allSettled(removeOps);
};

module.exports = { connectToMikrotik, safeWrite, getErrorMessage, cleanTunnelRules };