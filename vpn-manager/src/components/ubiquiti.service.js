const http = require('http');
const https = require('https');
const net = require('net');
const { Client: SSH2Client } = require('ssh2');

const IPV4_REGEX = /^(25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)(\.(25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)){3}$/;
const CIDR_REGEX = /^(25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)(\.(25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)){3}\/(3[0-2]|[1-2]\d|\d)$/;

const getSubnetHosts = (cidr) => {
    const [network, bits] = cidr.split('/');
    const prefixLen = parseInt(bits, 10);
    const toNum = addr => addr.split('.').reduce((acc, oct) => ((acc << 8) | parseInt(oct, 10)) >>> 0, 0);
    const toIP = num => [24, 16, 8, 0].map(b => (num >>> b) & 0xff).join('.');
    const mask = prefixLen > 0 ? (~0 << (32 - prefixLen)) >>> 0 : 0;
    const netBase = (toNum(network) & mask) >>> 0;
    const total = 1 << (32 - prefixLen);
    const ips = [];
    for (let i = 1; i < total - 1; i++) ips.push(toIP((netBase + i) >>> 0));
    return ips;
};

const probeStatusCgi = (deviceIP, port, useHttps) => {
    return new Promise((resolve) => {
        const lib = useHttps ? https : http;
        const req = lib.request({
            hostname: deviceIP, port, path: '/status.cgi', method: 'GET', timeout: 2000,
            headers: { Accept: 'application/json, */*', Connection: 'close' }, rejectUnauthorized: false,
        }, (res) => {
            if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) return resolve(null);
            let body = '';
            res.on('data', chunk => { body += chunk; });
            res.on('end', () => {
                try {
                    const data = JSON.parse(body);
                    if (!data || !data.host || !data.host.devmodel) return resolve(null);
                    const h = data.host; const w = data.wireless || {};
                    resolve({
                        ip: deviceIP, mac: (h.macaddr || '').toUpperCase(), name: h.hostname || deviceIP,
                        model: h.devmodel || 'Unknown', firmware: h.fwversion || 'Unknown',
                        role: (['master', 'ap', 'apauto', 'ap-ptp', 'ap-ptmp'].includes(w.mode)) ? 'ap' : (w.mode ? 'sta' : 'unknown'),
                        parentAp: (w.remote && w.remote.hostname) || w.essid || '', essid: w.essid || '', frequency: parseInt(w.frequency) || 0,
                    });
                } catch { resolve(null); }
            });
        });
        req.on('error', () => resolve(null));
        req.on('timeout', () => { req.destroy(); resolve(null); });
        req.end();
    });
};

const getSSHBanner = (host, port = 22, timeout = 2000) => new Promise((resolve) => {
    const sock = new net.Socket();
    let banner = '';
    const timer = setTimeout(() => { sock.destroy(); resolve(null); }, timeout);
    sock.connect(port, host, () => { });
    sock.on('data', (data) => { banner += data.toString(); clearTimeout(timer); sock.destroy(); resolve(banner); });
    sock.on('error', () => { clearTimeout(timer); resolve(null); });
    sock.on('timeout', () => { sock.destroy(); clearTimeout(timer); resolve(null); });
});

const probeUbiquiti = async (deviceIP) => {
    const [http80, https443] = await Promise.all([probeStatusCgi(deviceIP, 80, false), probeStatusCgi(deviceIP, 443, true)]);
    if (http80 || https443) return http80 || https443;
    const banner = await getSSHBanner(deviceIP, 22, 2000);
    if (banner && banner.toLowerCase().includes('dropbear')) {
        return { ip: deviceIP, mac: '', name: deviceIP, model: 'Ubiquiti airOS (SSH)', firmware: 'desconocido', role: 'unknown', parentAp: '', essid: '', frequency: 0 };
    }
    return null;
};

const sshExec = (host, port, username, password, command) => {
    return new Promise((resolve, reject) => {
        const conn = new SSH2Client();
        let output = '';
        const globalTimer = setTimeout(() => { conn.destroy(); reject(new Error('Tiempo de espera SSH agotado (10s)')); }, 10000);
        conn.on('ready', () => {
            conn.exec(command, (err, stream) => {
                if (err) { clearTimeout(globalTimer); conn.end(); return reject(err); }
                stream.on('data', data => { output += data.toString(); });
                stream.stderr.on('data', () => { });
                stream.on('close', () => { clearTimeout(globalTimer); conn.end(); resolve(output.trim()); });
            });
        });
        conn.on('error', err => { clearTimeout(globalTimer); reject(err); });
        conn.connect({
            host, port: port || 22, username, password, readyTimeout: 8000,
            algorithms: {
                kex: ['ecdh-sha2-nistp256', 'diffie-hellman-group14-sha1', 'diffie-hellman-group1-sha1'],
                serverHostKey: ['ssh-rsa', 'ssh-dss', 'ecdsa-sha2-nistp256'],
                cipher: ['aes128-ctr', 'aes256-ctr', 'aes128-cbc', '3des-cbc'], hmac: ['hmac-sha1', 'hmac-sha2-256', 'hmac-md5'],
            },
        });
    });
};

const parseAirOSStats = (output) => {
    const pick = (sources, ...keys) => {
        for (const src of sources) {
            if (!src || typeof src !== 'object') continue;
            for (const key of keys) { const v = src[key]; if (v != null && v !== '' && v !== 0) return v; }
        }
        return null;
    };
    const pickNum = (sources, ...keys) => {
        for (const src of sources) {
            if (!src || typeof src !== 'object') continue;
            for (const key of keys) { const v = src[key]; if (v != null && v !== '') return v; }
        }
        return null;
    };

    try {
        const data = JSON.parse(output);
        const h = data.host || {}; const w = data.wireless || {}; const am = data.airmax || {};
        const ifaces = Array.isArray(data.interfaces) ? data.interfaces : [];
        const toMbps = bps => bps ? Math.round(parseInt(bps) / 1_000_000) : null;
        const toCCQ = raw => raw != null ? parseFloat((parseInt(raw) / 10).toFixed(1)) : null;

        let memoryPercent = null; const memObj = h.memory || data.memory || {};
        if (memObj.total > 0) memoryPercent = Math.round(((memObj.total - memObj.free) / memObj.total) * 100);
        else if (h.memtotal > 0) memoryPercent = Math.round(((h.memtotal - h.memfree) / h.memtotal) * 100);

        let uptimeStr = null; const uptimeSec = pick([h, data], 'uptime');
        if (uptimeSec) {
            const d = Math.floor(uptimeSec / 86400), hh = Math.floor((uptimeSec % 86400) / 3600), mm = Math.floor((uptimeSec % 3600) / 60), ss = uptimeSec % 60;
            uptimeStr = d > 0 ? `${d} días ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
        }

        const freq = parseInt(pick([w, data], 'frequency', 'freq', 'cf', 'center_freq'));
        const rawExt = (pick([w, data], 'chanbw_cfg', 'chanbwcfg', 'channel_ext', 'ht_mode', 'chanExt') || '').toString().toUpperCase();
        const chanbw = parseInt(pick([w, data], 'chanbw', 'bw', 'cbw', 'channel_width'));
        const wlanMac = (pick([ifaces.find(i => /^(wlan|ath)/i.test(i.ifname)), h, w, data], 'hwaddr', 'macaddr', 'mac', 'wlanmac') || '').toUpperCase();
        const lanMac = ((ifaces.find(i => /^(eth|br)/i.test(i.ifname))?.hwaddr || pick([h, data], 'lanmac', 'lan_mac')) || '').toUpperCase();
        const rawApMac = pick([w.remote, w, data], 'mac', 'apmac', 'bssid');
        const apMac = rawApMac && rawApMac.toUpperCase() !== wlanMac ? rawApMac.toUpperCase() : null;

        return {
            signal: parseInt(pickNum([w, data], 'signal', 'rssi', 'rx_signal')) || null,
            noiseFloor: parseInt(pickNum([w, data], 'noisefloor', 'noise_floor', 'noise')) || null,
            ccq: toCCQ(pickNum([w, data], 'ccq', 'txccq')), txRate: toMbps(pick([w, data], 'txrate', 'tx_rate')), rxRate: toMbps(pick([w, data], 'rxrate', 'rx_rate')),
            cpuLoad: parseInt(pick([h, data], 'cpuload', 'cpu_load', 'cpu')) || null, memoryPercent,
            airmaxQuality: parseInt(am.quality || data.airmax_quality) || null, airmaxCapacity: parseInt(am.capacity || data.airmax_capacity) || null,
            uptimeStr, deviceDate: pick([h, data], 'time', 'date', 'localtime') || null,
            stations: (data.sta || data.stations || []).map(s => ({
                mac: (s.mac || '').toUpperCase(), signal: parseInt(s.signal) || parseInt(s.rssi) || null,
                noiseFloor: parseInt(s.noisefloor) || null, ccq: toCCQ(s.ccq || s.txccq),
                txRate: toMbps(s.txrate || s.tx_rate), rxRate: toMbps(s.rxrate || s.rx_rate), distance: s.ackdistance || null, uptime: s.uptime || null,
            })),
            deviceName: pick([h, data], 'hostname', 'name', 'devname') || null, deviceModel: pick([h, data], 'devmodel', 'product', 'model') || null,
            firmwareVersion: pick([h, data], 'fwversion', 'version', 'fw') || null, wlanMac: wlanMac || null, lanMac: lanMac || null, apMac,
            essid: pick([w, data], 'essid', 'ssid') || null, security: pick([w, data], 'security', 'auth', 'encrypt') || null,
            mode: pick([w, data], 'mode', 'wmode', 'opermode') || null, networkMode: pick([h, data], 'netrole', 'network_mode', 'role') || null,
            frequency: freq, channelWidth: chanbw, txPower: parseInt(pick([w, data], 'txpower', 'tx_power')) || null,
            distance: pick([w, data], 'ackdistance', 'distance') || null, chains: parseInt(pick([w, data], 'chains', 'txchains')) > 0 ? `${parseInt(pick([w, data], 'chains'))}X${parseInt(pick([w, data], 'chains'))}` : null,
            airmaxEnabled: am.enabled != null ? !!am.enabled : undefined,
        };
    } catch {
        try {
            const kv = {}; output.split('\n').forEach(line => { const eq = line.indexOf('='); if (eq > 0) kv[line.slice(0, eq).trim().toLowerCase()] = line.slice(eq + 1).trim(); });
            if (Object.keys(kv).length > 0) {
                const toMbps = v => v ? Math.round(parseInt(v) / 1_000_000) : null;
                const toCCQ = v => v != null ? parseFloat((parseInt(v) / 10).toFixed(1)) : null;
                const kget = (...keys) => { for (const k of keys) { const v = kv[k]; if (v != null && v !== '') return v; } return null; };
                return {
                    signal: parseInt(kget('signal', 'rssi')) || null, noiseFloor: parseInt(kget('noisefloor', 'noise_floor')) || null,
                    ccq: toCCQ(kget('ccq', 'txccq')), txRate: toMbps(kget('txrate', 'tx.rate')), rxRate: toMbps(kget('rxrate', 'rx.rate')),
                    frequency: parseInt(kget('frequency', 'freq')) || null, essid: kget('essid', 'ssid') || null, mode: kget('mode', 'wmode') || null,
                    deviceName: kget('hostname', 'name') || null, deviceModel: kget('devmodel', 'product') || null, firmwareVersion: kget('fwversion', 'version') || null,
                    wlanMac: (kget('wlan.mac', 'wlanmac', 'mac') || '').toUpperCase() || null, lanMac: (kget('lan.mac', 'lanmac') || '').toUpperCase() || null,
                    apMac: (kget('apmac', 'ap.mac', 'bssid') || '').toUpperCase() || null, airmaxEnabled: kget('airmax.status', 'airmax') === 'enabled' || undefined, stations: [],
                };
            }
        } catch { }
        return { raw: output.slice(0, 3000) };
    }
};

module.exports = { IPV4_REGEX, CIDR_REGEX, getSubnetHosts, probeUbiquiti, sshExec, parseAirOSStats };