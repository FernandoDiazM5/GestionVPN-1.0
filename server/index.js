const express = require('express');
const cors = require('cors');
const { RouterOSAPI } = require('node-routeros');

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

    if (removeOps.length > 0) await Promise.all(removeOps);
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
    const comment   = `ND${nodeNumber}`;

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

    // Extraer gateway (primer IP de la subred, ej: 10.1.1.0/24 → 10.1.1.1)
    const [netAddr, mask] = lanSubnet.split('/');
    const octets = netAddr.split('.').map(Number);
    octets[3] = 1;
    const gatewayIP = octets.join('.');
    const lanCIDR = `${gatewayIP}/${mask}`;

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
add name=pool-lan ranges=${octets[0]}.${octets[1]}.${octets[2]}.100-${octets[0]}.${octets[1]}.${octets[2]}.254
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

// Levanta el servidor Express
app.listen(PORT, () => {
    console.log(`\n==============================================`);
    console.log(`  Servidor Backend MikroTik API Proxy`);
    console.log(`  http://localhost:${PORT}`);
    console.log(`  Usando node-routeros (API nativa RouterOS)`);
    console.log(`==============================================\n`);
});
