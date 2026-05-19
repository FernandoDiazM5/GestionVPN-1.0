const { sshExec, parseFullOutput, ANTENNA_CMD, decodeHtmlEntities } = require('./ubiquiti.service');

// In-memory throughput delta cache: { apId: { mac: { rxBytes, txBytes, ts } } }
const bytesCache = {};

// ── Detecta si el firmware es M5/M-series (XW./XM.) o AC-series (WA./WB.) ─
const isM5Firmware = (firmware = '') => /^(XW|XM)\./i.test(firmware.trim());

// ── Parser completo para wstalist (AC) y /usr/www/sta.cgi (M5) ───────────
// Extrae todos los campos disponibles de ambos formatos y los normaliza
// en un objeto enriquecido que incluye datos del equipo remoto (CPE).
const parseWstalist = (output) => {
    try {
        const trimmed = output.trim();
        // /usr/www/sta.cgi (M5) emite "Content-Type: text/html\n" antes del JSON.
        // Buscamos el primer '[' u '{' para saltarnos cualquier header CGI.
        const iArr = trimmed.indexOf('[');
        const iObj = trimmed.indexOf('{');
        const start = iArr < 0 ? iObj : (iObj < 0 ? iArr : Math.min(iArr, iObj));
        if (start < 0) return [];
        const jsonStr = trimmed.slice(start);
        let data;
        if (jsonStr.startsWith('['))       data = JSON.parse(jsonStr);
        else if (jsonStr.startsWith('{')) { const obj = JSON.parse(jsonStr); data = obj.sta || obj.stations || []; }
        else return [];
        if (!Array.isArray(data)) return [];

        return data.map(sta => {
            const g  = (...keys) => { for (const k of keys) { if (sta[k] != null) return sta[k]; } return null; };
            const mac = (g('mac') || '').toUpperCase();
            if (!mac) return null;

            const rem = sta.remote || {};
            const am  = sta.airmax  || {};

            // ── Detección de formato ────────────────────────────────────────
            // AC wstalist: tx/rx son Mbps float, airmax tiene downlink_capacity
            // M5 sta.cgi:  ccq en root, txpower (sin _), airmax tiene quality/capacity
            const isAC = am.downlink_capacity != null || sta.tx_idx != null;

            // ── CCQ ─────────────────────────────────────────────────────────
            // M5 sta.cgi: ccq 0-100 en root. AC: no tiene ccq root,
            // pero historial guardado puede tenerlo como tenths (>100 → /10).
            const rawCcq = g('ccq', 'txccq', 'tx_ccq');
            const ccq = rawCcq != null
                ? (parseInt(rawCcq) > 100 ? parseFloat((parseInt(rawCcq) / 10).toFixed(1)) : parseFloat(rawCcq))
                : null;

            // ── Tasas TX/RX ──────────────────────────────────────────────────
            // AC wstalist: tx/rx directamente en Mbps (float)
            // M5 sta.cgi:  tx/rx también en Mbps (float)
            // Historial puede guardar tx_rate/rx_rate en kbps
            const txMbps = g('tx') != null ? parseFloat(g('tx'))
                         : g('tx_rate', 'txrate') != null ? parseFloat(g('tx_rate', 'txrate'))
                         : null;
            const rxMbps = g('rx') != null ? parseFloat(g('rx'))
                         : g('rx_rate', 'rxrate') != null ? parseFloat(g('rx_rate', 'rxrate'))
                         : null;

            // ── AirMax ──────────────────────────────────────────────────────
            // M5:  am.quality (%), am.capacity (%), am.signal (dBm)
            // AC:  am.downlink_capacity (kbps), am.uplink_capacity (kbps),
            //      am.rx.cinr, am.tx.cinr, am.rx.usage, am.tx.usage
            const amQuality  = am.quality  != null ? parseInt(am.quality)  : null; // M5 %
            const amCapacity = am.capacity != null ? parseInt(am.capacity) : null; // M5 %
            const amSignal   = am.signal   != null ? parseInt(am.signal)   : null; // M5 AirMax signal dBm
            const amDcap     = am.downlink_capacity != null ? Math.round(am.downlink_capacity / 1000) : null; // AC kbps→Mbps
            const amUcap     = am.uplink_capacity   != null ? Math.round(am.uplink_capacity   / 1000) : null;
            const amCinrRx   = am.rx?.cinr != null ? parseFloat(am.rx.cinr) : null;
            const amCinrTx   = am.tx?.cinr != null ? parseFloat(am.tx.cinr) : null;
            const amRxUsage  = am.rx?.usage != null ? parseFloat(am.rx.usage) : null;
            const amTxUsage  = am.tx?.usage != null ? parseFloat(am.tx.usage) : null;
            const amAtpc     = am.atpc_status != null ? parseInt(am.atpc_status) : null;

            // ── Stats de tráfico ─────────────────────────────────────────────
            const stats = sta.stats || {};
            const txBytes = stats.tx_bytes != null ? parseInt(stats.tx_bytes)
                          : g('tx_bytes', 'txbytes') != null ? parseInt(g('tx_bytes', 'txbytes')) : null;
            const rxBytes = stats.rx_bytes != null ? parseInt(stats.rx_bytes)
                          : g('rx_bytes', 'rxbytes') != null ? parseInt(g('rx_bytes', 'rxbytes')) : null;

            return {
                mac,
                // ── Identidad del CPE (visible en AP side) ──────────────────
                cpe_name:       decodeHtmlEntities(g('name', 'hostname', 'devname') || rem.hostname || null),
                cpe_product:    rem.platform || g('product', 'devmodel', 'model') || null,
                cpe_version:    rem.version  || null,
                lastip:         g('lastip', 'last_ip', 'ip') || null,

                // ── RF del AP hacia el CPE (AP side) ────────────────────────
                signal:         g('signal')    != null ? parseInt(g('signal'))    : null,
                rssi:           g('rssi')      != null ? parseInt(g('rssi'))      : null,
                noisefloor:     g('noisefloor')!= null ? parseInt(g('noisefloor')): null,
                chainrssi:      Array.isArray(sta.chainrssi) ? sta.chainrssi.map(Number) : null,
                tx_power:       g('tx_power', 'txpower') != null ? parseInt(g('tx_power', 'txpower')) : null,
                ccq,
                tx_rate:        txMbps,
                rx_rate:        rxMbps,
                tx_latency:     g('tx_latency') != null ? parseInt(g('tx_latency')) : null,
                distance:       g('distance', 'ackdistance') != null ? parseInt(g('distance', 'ackdistance')) : null,
                uptime:         g('uptime')     != null ? parseInt(g('uptime'))     : null,
                idle:           g('idle')       != null ? parseInt(g('idle'))       : null,

                // ── AC-específico ────────────────────────────────────────────
                tx_idx:         sta.tx_idx  != null ? parseInt(sta.tx_idx)  : null,
                rx_idx:         sta.rx_idx  != null ? parseInt(sta.rx_idx)  : null,
                tx_nss:         sta.tx_nss  != null ? parseInt(sta.tx_nss)  : null,
                rx_nss:         sta.rx_nss  != null ? parseInt(sta.rx_nss)  : null,

                // ── AirMax ───────────────────────────────────────────────────
                airmax_quality:  amQuality,   // M5 0-100 %
                airmax_capacity: amCapacity,  // M5 0-100 %
                airmax_signal:   amSignal,    // M5 AirMax RF signal dBm
                airmax_dcap:     amDcap,      // AC Mbps
                airmax_ucap:     amUcap,      // AC Mbps
                airmax_cinr_rx:  amCinrRx,    // AC dB
                airmax_cinr_tx:  amCinrTx,    // AC dB
                airmax_rx_usage: amRxUsage,   // AC %
                airmax_tx_usage: amTxUsage,   // AC %
                airmax_atpc:     amAtpc,

                // ── Estadísticas de tráfico ──────────────────────────────────
                tx_bytes:    txBytes,
                rx_bytes:    rxBytes,
                tx_pps:      stats.tx_pps != null ? parseInt(stats.tx_pps) : null,
                rx_pps:      stats.rx_pps != null ? parseInt(stats.rx_pps) : null,

                // ── Datos del equipo remoto (CPE side) ───────────────────────
                remote_hostname:    decodeHtmlEntities(rem.hostname || null),
                remote_platform:    rem.platform    || null,
                remote_version:     rem.version     || null,
                remote_signal:      rem.signal      != null ? parseInt(rem.signal)    : null,
                remote_rssi:        rem.rssi        != null ? parseInt(rem.rssi)      : null,
                remote_noisefloor:  rem.noisefloor  != null ? parseInt(rem.noisefloor): null,
                remote_tx_power:    rem.tx_power    != null ? parseInt(rem.tx_power)  : null,
                remote_chainrssi:   Array.isArray(rem.chainrssi) ? rem.chainrssi.map(Number) : null,
                remote_cpuload:     rem.cpuload     != null ? parseFloat(rem.cpuload) : null,
                remote_netrole:     rem.netrole     || null,
                remote_mode:        rem.mode        || null,
                remote_antenna_gain:rem.antenna_gain!= null ? parseFloat(rem.antenna_gain) : null,
                remote_uptime:      rem.uptime      != null ? parseInt(rem.uptime)    : null,
                remote_distance:    rem.distance    != null ? parseInt(rem.distance)  : null,  // M5
                remote_tx_latency:  rem.tx_latency  != null ? parseInt(rem.tx_latency): null,  // M5

                // ── Flag de formato ──────────────────────────────────────────
                firmware_family: isAC ? 'AC' : 'M5',
            };
        }).filter(Boolean);
    } catch (e) {
        console.warn('[AP Service] parseWstalist error:', e.message, '| raw:', output.slice(0, 200));
        return [];
    }
};

// ── Format uptime seconds ─────────────────────────────────────────────────
const formatUptime = (sec) => {
    if (sec == null) return null;
    const d  = Math.floor(sec / 86400);
    const hh = Math.floor((sec % 86400) / 3600);
    const mm = Math.floor((sec % 3600) / 60);
    const ss = sec % 60;
    const p  = (n) => String(n).padStart(2, '0');
    return d > 0 ? `${d}d ${p(hh)}:${p(mm)}:${p(ss)}` : `${p(hh)}:${p(mm)}:${p(ss)}`;
};

// ── Poll AP via wstalist (AC) o /usr/www/sta.cgi (M5) ────────────────────
const pollAp = async (apId, ip, port, user, pass, firmware = '') => {
    const cmd = isM5Firmware(firmware) ? '/usr/www/sta.cgi 2>/dev/null' : 'wstalist 2>/dev/null';
    const output = await sshExec(ip, port || 22, user, pass, cmd, 15000, 8000);
    const stations = parseWstalist(output);
    const now = Date.now();
    if (!bytesCache[apId]) bytesCache[apId] = {};

    return stations.map(sta => {
        const cache = bytesCache[apId][sta.mac];
        let throughputRxKbps = null;
        let throughputTxKbps = null;
        if (cache && sta.rx_bytes != null && sta.tx_bytes != null) {
            const dt = (now - cache.ts) / 1000;
            if (dt > 1) {
                const rxDelta = sta.rx_bytes - cache.rxBytes;
                const txDelta = sta.tx_bytes - cache.txBytes;
                throughputRxKbps = rxDelta >= 0 ? Math.round((rxDelta * 8) / dt / 1000) : null;
                throughputTxKbps = txDelta >= 0 ? Math.round((txDelta * 8) / dt / 1000) : null;
            }
        }
        if (sta.rx_bytes != null) {
            bytesCache[apId][sta.mac] = { rxBytes: sta.rx_bytes, txBytes: sta.tx_bytes || 0, ts: now };
        }
        return { ...sta, uptimeStr: formatUptime(sta.uptime), throughputRxKbps, throughputTxKbps };
    });

    // B22: Limpiar entradas de MACs no vistas en la última hora para evitar memory leak
    const expiry = now - 3_600_000;
    for (const mac of Object.keys(bytesCache[apId])) {
        if (bytesCache[apId][mac].ts < expiry) delete bytesCache[apId][mac];
    }
};

// ── Get AP or CPE static config (lightweight — 5 sections) ───────────────
const DETAIL_CMD = [
    'echo __MCA__',  'mca-status 2>/dev/null',
    'echo __CFG__',  'cat /tmp/system.cfg 2>/dev/null',
    'echo __HN__',   'cat /proc/sys/kernel/hostname 2>/dev/null',
    'echo __VER__',  'cat /etc/version 2>/dev/null',
    'echo __IFC__',  'ifconfig 2>/dev/null',
].join('; ');

const getDetail = async (ip, port, user, pass) => {
    const output = await sshExec(ip, port || 22, user, pass, DETAIL_CMD, 20000, 8000);
    return parseFullOutput(output);
};

// ── Full AP detail — uses ANTENNA_CMD (12 sections, more data) ────────────
const getFullDetail = async (ip, port, user, pass) => {
    const output = await sshExec(ip, port || 22, user, pass, ANTENNA_CMD, 30000, 10000);
    return parseFullOutput(output);
};

const clearApCache = (apId) => { delete bytesCache[apId]; };

module.exports = { parseWstalist, pollAp, getDetail, getFullDetail, formatUptime, clearApCache };
