const { RouterOSAPI } = require('node-routeros');
const log = require('./lib/logger').child({ scope: 'routeros' });
const metrics = require('./lib/metrics');

// ── Health signal para /api/health (FASE 9) ─────────────────────────────────
//  Marca el instante (ms epoch) del último safeWrite resuelto OK.
//  /api/health lo compara con Date.now() y traduce a:
//    ok    < 60s   · stale < 5min  · down ≥ 5min  · unknown si nunca
let _lastSafeWriteOkAt = null;
const getLastSafeWriteOkAt = () => _lastSafeWriteOkAt;

// Clasificador de errores para la métrica routeros_errors_total{type}.
// Distinguir entre timeout, refused, login y network ayuda a diagnosticar
// caída de red vs router apagado vs credenciales rotadas.
function classifyError(err) {
    const code = err?.code;
    const errno = err?.errno;
    const msg = (err?.message || '').toLowerCase();
    if (errno === -4039 || errno === 'SOCKTMOUT' || code === 'ETIMEDOUT'
        || err?.name === 'TimeoutError' || msg.includes('timed out')
        || msg.includes('sin respuesta')) return 'timeout';
    if (errno === -4078 || code === 'ECONNREFUSED' || msg.includes('connection refused')) return 'refused';
    if (errno === 'CANTLOGIN' || msg.includes('invalid user name or password')
        || msg.includes('cannot log in') || msg.includes('cantlogin')) return 'login';
    if (code === 'ENOTFOUND' || code === 'EHOSTUNREACH' || code === 'ENETUNREACH'
        || code === 'ECONNRESET' || code === 'EPIPE') return 'network';
    return 'unknown';
}

// ── Parche node-routeros: manejar la respuesta `!empty` de RouterOS ──────────
//  RouterOS envía `!empty` (seguido de `!done`) cuando un /print no tiene filas
//  (ej. tabla mangle vacía). node-routeros v1.6.9 no la conoce: su processPacket
//  cae en `default`, emite 'unknown' (que LANZA en onUnknown) y CIERRA el canal.
//  Eso provoca o bien un uncaughtException, o un UNREGISTEREDTAG cuando llega el
//  `!done` posterior. Aquí simplemente IGNORAMOS `!empty` (sin cerrar): el `!done`
//  que viene a continuación resuelve la promesa con la data acumulada (= []).
try {
    const { Channel } = require('node-routeros/dist/Channel');
    if (Channel && Channel.prototype && !Channel.prototype.__emptyPatched) {
        const _origProcessPacket = Channel.prototype.processPacket;
        Channel.prototype.processPacket = function (packet) {
            if (Array.isArray(packet) && packet[0] === '!empty') {
                return; // resultado vacío normal → no cerrar; el !done siguiente resuelve []
            }
            return _origProcessPacket.call(this, packet);
        };
        Channel.prototype.__emptyPatched = true;
        log.info('Parche !empty aplicado a node-routeros Channel');
    }
} catch (e) {
    log.warn({ err: e }, 'No se pudo aplicar el parche !empty');
}

const connectToMikrotik = async (host, user, password) => {
    // ── Intento 1: puerto 8728 (plain API) ──────────────────────────────────
    try {
        const api = new RouterOSAPI({ host, user, password, port: 8728, timeout: 8, keepalive: false });
        await api.connect();
        log.debug({ host, port: 8728, mode: 'plain' }, 'Conectado a MikroTik');
        return api;
    } catch (err) {
        const errno = err?.errno;
        const code = err?.code;
        // Solo reintentamos en ECONNREFUSED (puerto cerrado activamente).
        // Si el puerto está filtrado/firewall (SOCKTMOUT/ETIMEDOUT), ambos puertos
        // tendrán el mismo problema y no tiene sentido esperar 8s extra en 8729.
        if (errno !== -4078 && code !== 'ECONNREFUSED') throw err;
        log.debug({ host }, '8728 rechazado, reintentando con SSL 8729');
    }
    // ── Intento 2: puerto 8729 (SSL API) — solo si 8728 fue rechazado activamente ─
    try {
        const api = new RouterOSAPI({ host, user, password, port: 8729, tls: { rejectUnauthorized: false }, timeout: 8, keepalive: false });
        await api.connect();
        log.debug({ host, port: 8729, mode: 'ssl' }, 'Conectado a MikroTik');
        return api;
    } catch (err) {
        metrics.routerosErrorsTotal.inc({ type: classifyError(err) });
        throw err;
    }
};

const safeWrite = (api, commands, timeoutMs = 6000) =>
    new Promise((resolve, reject) => {
        let settled = false;
        const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            const err = new Error('Sin respuesta del router (timeout)');
            metrics.routerosErrorsTotal.inc({ type: 'timeout' });
            metrics.routerosWritesTotal.inc({ status: 'error' });
            reject(err);
        }, timeoutMs);
        api.write(commands).then(
            (result) => {
                if (!settled) {
                    settled = true;
                    clearTimeout(timer);
                    _lastSafeWriteOkAt = Date.now();
                    metrics.routerosWritesTotal.inc({ status: 'ok' });
                    resolve(result);
                }
            },
            (err)    => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                // RouterOS responde `!empty` cuando un /print no tiene filas. node-routeros
                // (v1.6.9) no lo maneja y lanza UNKNOWNREPLY. Es un resultado VACÍO normal,
                // NO un fallo → lo normalizamos a []. Cualquier otro error sí se propaga.
                const isEmpty = err?.errno === 'UNKNOWNREPLY' && /!empty/i.test(err?.message || '');
                if (isEmpty) {
                    _lastSafeWriteOkAt = Date.now();
                    metrics.routerosWritesTotal.inc({ status: 'ok' });
                    return resolve([]);
                }
                metrics.routerosErrorsTotal.inc({ type: classifyError(err) });
                metrics.routerosWritesTotal.inc({ status: 'error' });
                reject(err);
            },
        );
    });

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
 * cleanTunnelRules — Elimina las reglas mangle de acceso dinámico.
 * Borra todas las entradas con comment=ACCESO-ADMIN o comment=ACCESO-DINAMICO.
 * vpn-activa NO se toca (192.168.21.0/24 es estático en MikroTik).
 *
 * @param {object} api - Instancia de RouterOSAPI conectada
 * @returns {number} Cantidad de reglas eliminadas
 */
const cleanTunnelRules = async (api) => {
    // vpn-activa 192.168.21.0/24 es ESTÁTICO en MikroTik — no se toca aquí
    const allMangle = await safeWrite(api, ['/ip/firewall/mangle/print']).catch(() => []);
    const toDelete = allMangle.filter(e =>
        (e.comment === 'ACCESO-DINAMICO' || e.comment === 'ACCESO-ADMIN') && e['.id']
    );
    for (const e of toDelete) {
        await safeWrite(api, ['/ip/firewall/mangle/remove', `=.id=${e['.id']}`]).catch(err => {
            log.warn({ err, mangleId: e['.id'] }, 'No se pudo borrar mangle');
        });
    }
    return toDelete.length;
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
            log.debug({ command: commands[0] }, 'Recurso ya existe (ignorado por idempotente)');
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

module.exports = { connectToMikrotik, safeWrite, getErrorMessage, cleanTunnelRules, writeIdempotent, parseHandshakeSecs, getLastSafeWriteOkAt };
