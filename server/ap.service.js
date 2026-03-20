const { sshExec, parseFullOutput } = require('./ubiquiti.service');

// In-memory throughput delta cache: { apId: { mac: { rxBytes, txBytes, ts } } }
const bytesCache = {};

// ── wstalist JSON parser ──────────────────────────────────────────────────
const parseWstalist = (output) => {
    try {
        const trimmed = output.trim();
        let data;
        if (trimmed.startsWith('['))      data = JSON.parse(trimmed);
        else if (trimmed.startsWith('{')) { const obj = JSON.parse(trimmed); data = obj.sta || obj.stations || []; }
        else return [];
        if (!Array.isArray(data)) return [];

        return data.map(sta => {
            const g = (...keys) => { for (const k of keys) { if (sta[k] != null) return sta[k]; } return null; };
            const mac = (g('mac') || '').toUpperCase();
            if (!mac) return null;
            return {
                mac,
                signal:          g('signal') != null ? parseInt(g('signal')) : null,
                rssi:            g('rssi', 'remote_rssi') != null ? parseInt(g('rssi', 'remote_rssi')) : null,
                noisefloor:      g('noisefloor', 'noise_floor') != null ? parseInt(g('noisefloor', 'noise_floor')) : null,
                cinr:            g('cinr') != null ? parseFloat(g('cinr')) : null,
                ccq:             g('ccq', 'txccq') != null ? parseFloat((parseInt(g('ccq', 'txccq')) / 10).toFixed(1)) : null,
                tx_rate:         g('tx_rate', 'txrate') != null ? parseInt(g('tx_rate', 'txrate')) : null,
                rx_rate:         g('rx_rate', 'rxrate') != null ? parseInt(g('rx_rate', 'rxrate')) : null,
                airtime_tx:      g('airtime_tx', 'tx_airtime') != null ? parseFloat(g('airtime_tx', 'tx_airtime')) : null,
                airtime_rx:      g('airtime_rx', 'rx_airtime') != null ? parseFloat(g('airtime_rx', 'rx_airtime')) : null,
                uptime:          g('uptime') != null ? parseInt(g('uptime')) : null,
                distance:        g('ackdistance') != null ? parseFloat((parseInt(g('ackdistance')) / 1000).toFixed(3)) : null,
                lastip:          g('lastip', 'last_ip') || null,
                tx_bytes:        g('tx_bytes', 'txbytes') != null ? parseInt(g('tx_bytes', 'txbytes')) : null,
                rx_bytes:        g('rx_bytes', 'rxbytes') != null ? parseInt(g('rx_bytes', 'rxbytes')) : null,
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

// ── Poll AP via wstalist ──────────────────────────────────────────────────
const pollAp = async (apId, ip, port, user, pass) => {
    const output = await sshExec(ip, port || 22, user, pass, 'wstalist 2>/dev/null', 15000, 8000);
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
};

// ── Get AP or CPE static config via multi-section SSH ────────────────────
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

const clearApCache = (apId) => { delete bytesCache[apId]; };

module.exports = { parseWstalist, pollAp, getDetail, formatUptime, clearApCache };
