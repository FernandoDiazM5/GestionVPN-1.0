const http = require('http');
const https = require('https');
const net = require('net');
const { Client: SSH2Client } = require('ssh2');

const IPV4_REGEX = /^(25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)(\.(25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)){3}$/;
const CIDR_REGEX = /^(25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)(\.(25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)){3}\/(3[0-2]|[1-2]\d|\d)$/;

// Comando SSH combinado — 12 secciones, BusyBox compatible (cada ; es independiente)
const ANTENNA_CMD = [
    'echo __MCA__',     'mca-status 2>/dev/null',
    'echo __CFG__',     'cat /tmp/system.cfg 2>/dev/null',
    'echo __HN__',      'cat /proc/sys/kernel/hostname 2>/dev/null',
    'echo __VER__',     'cat /etc/version 2>/dev/null',
    'echo __IFC__',     'ifconfig 2>/dev/null',
    'echo __UNAME__',   'uname -a 2>/dev/null; uptime 2>/dev/null',
    'echo __MEMINFO__', 'cat /proc/meminfo 2>/dev/null',
    'echo __ROUTES__',  'route -n 2>/dev/null',
    'echo __IWCFG__',   'iwconfig ath0 2>/dev/null',
    'echo __WSTA__',    'wstalist 2>/dev/null',
    'echo __MCACLI__',  'mca-cli-op info 2>/dev/null',
    'echo __NETDEV__',  'cat /proc/net/dev 2>/dev/null',
].join('; ');

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

const sshExec = (host, port, username, password, command, timeoutMs = 10000, readyTimeoutMs = 8000) => {
    return new Promise((resolve, reject) => {
        const conn = new SSH2Client();
        let output = '';
        const globalTimer = setTimeout(() => { conn.destroy(); reject(new Error('Tiempo de espera SSH agotado')); }, timeoutMs);
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
            host, port: port || 22, username, password, readyTimeout: readyTimeoutMs,
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

        // Convierte tasa a Mbps. airOS M reporta txrate/rxrate en kbps (ej: 150000 = 150 Mbps).
        // Heurística por rango (max WiFi real ~1.7 Gbps):
        //   > 1_700_000 → viene en bps  → /1_000_000
        //   > 1_700     → viene en kbps → /1_000
        //   ≤ 1_700     → ya viene en Mbps
        const toMbps = raw => {
            if (raw == null || raw === '') return null;
            const v = parseInt(raw);
            if (isNaN(v) || v < 0) return null;
            if (v > 1_700_000) return Math.round(v / 1_000_000);
            if (v > 1_700)     return Math.round(v / 1_000);
            return v;
        };
        const toCCQ = raw => raw != null ? parseFloat((parseInt(raw) / 10).toFixed(1)) : null;
        // Versión sin el filtro v !== 0 de pick(), para capturar valores numéricos incluyendo 0
        const pn = (src, ...keys) => { for (const k of keys) { const v = src?.[k]; if (v != null && v !== '') return v; } return null; };

        let memoryPercent = null; const memObj = h.memory || data.memory || {};
        if (memObj.total > 0) memoryPercent = Math.round(((memObj.total - memObj.free) / memObj.total) * 100);
        else if (h.memtotal > 0) memoryPercent = Math.round(((h.memtotal - h.memfree) / h.memtotal) * 100);

        // uptime — usar pickNum para no perder uptime=0 (justo arrancó)
        let uptimeStr = null;
        const uptimeSec = pickNum([h, data], 'uptime');
        if (uptimeSec != null) {
            const d = Math.floor(uptimeSec / 86400), hh = Math.floor((uptimeSec % 86400) / 3600), mm = Math.floor((uptimeSec % 3600) / 60), ss = uptimeSec % 60;
            uptimeStr = d > 0 ? `${d}d ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
        }

        const freq = parseInt(pickNum([w, data], 'frequency', 'freq', 'cf', 'center_freq'));
        const rawExt = (pick([w, data], 'chanbw_cfg', 'chanbwcfg', 'channel_ext', 'ht_mode', 'chanExt') || '').toString().toUpperCase();
        // channelWidth — usar pickNum para no perder valor 0; el entero NaN → null
        const chanbwRaw = pickNum([w, data], 'chanbw', 'bw', 'cbw', 'channel_width', 'chwidth');
        const chanbw = chanbwRaw != null ? parseInt(chanbwRaw) : NaN;

        const wlanMac = (pick([ifaces.find(i => /^(wlan|ath)/i.test(i.ifname)), h, w, data], 'hwaddr', 'macaddr', 'mac', 'wlanmac') || '').toUpperCase();
        const lanMac = ((ifaces.find(i => /^(eth|br)/i.test(i.ifname))?.hwaddr || pick([h, data], 'lanmac', 'lan_mac')) || '').toUpperCase();
        const rawApMac = pick([w.remote, w, data], 'mac', 'apmac', 'bssid');
        const apMac = rawApMac && rawApMac.toUpperCase() !== wlanMac ? rawApMac.toUpperCase() : null;

        // Señal y noise — pickNum para no perder valores negativos a través del filtro != 0
        const signalRaw  = pn(w, 'signal', 'rssi', 'rx_signal') ?? pn(data, 'signal', 'rssi');
        const noiseRaw   = pn(w, 'noisefloor', 'noise_floor', 'noise', 'rx_noisefloor') ?? pn(data, 'noisefloor', 'noise_floor');
        const cpuRaw     = pn(h, 'cpuload', 'cpu_load', 'cpu') ?? pn(data, 'cpuload', 'cpu');
        const txPowerRaw = pn(w, 'txpower', 'tx_power', 'txpwr') ?? pn(data, 'txpower');

        // AirMax — parseInt(0) es 0, not null
        const amQuality  = pn(am, 'quality') ?? pn(data, 'airmax_quality');
        const amCapacity = pn(am, 'capacity') ?? pn(data, 'airmax_capacity');

        return {
            signal:          signalRaw  != null ? parseInt(signalRaw)  : null,
            noiseFloor:      noiseRaw   != null ? parseInt(noiseRaw)   : null,
            ccq:             toCCQ(pickNum([w, data], 'ccq', 'txccq')),
            txRate:          toMbps(pickNum([w, data], 'txrate', 'tx_rate', 'linkspeed')),
            rxRate:          toMbps(pickNum([w, data], 'rxrate', 'rx_rate')),
            cpuLoad:         cpuRaw     != null ? parseInt(cpuRaw)     : null,
            memoryPercent,
            airmaxQuality:   amQuality  != null ? parseInt(amQuality)  : null,
            airmaxCapacity:  amCapacity != null ? parseInt(amCapacity) : null,
            uptimeStr,
            deviceDate: pick([h, data], 'time', 'date', 'localtime') || null,
            stations: (data.sta || data.stations || []).map(s => ({
                mac: (s.mac || '').toUpperCase(),
                signal:     parseInt(s.signal) || parseInt(s.rssi) || null,
                noiseFloor: s.noisefloor != null ? parseInt(s.noisefloor) : null,
                ccq:        toCCQ(s.ccq ?? s.txccq),
                txRate:     toMbps(s.txrate ?? s.tx_rate),
                rxRate:     toMbps(s.rxrate ?? s.rx_rate),
                distance:   s.ackdistance ?? null,
                uptime:     s.uptime ?? null,
            })),
            deviceName:      pick([h, data], 'hostname', 'name', 'devname') || null,
            deviceModel:     pick([h, data], 'devmodel', 'product', 'model') || null,
            firmwareVersion: pick([h, data], 'fwversion', 'version', 'fw') || null,
            wlanMac: wlanMac || null, lanMac: lanMac || null, apMac,
            essid:       pick([w, data], 'essid', 'ssid') || null,
            security:    pick([w, data], 'security', 'auth', 'encrypt') || null,
            mode:        pick([w, data], 'mode', 'wmode', 'opermode') || null,
            networkMode: pick([h, data], 'netrole', 'network_mode', 'role') || null,
            frequency:     isNaN(freq)   ? null : freq,
            channelWidth:  isNaN(chanbw) ? null : chanbw,
            txPower:       txPowerRaw != null ? parseInt(txPowerRaw) : null,
            distance: pick([w, data], 'ackdistance', 'distance') || null,
            chains: parseInt(pick([w, data], 'chains', 'txchains')) > 0 ? `${parseInt(pick([w, data], 'chains'))}X${parseInt(pick([w, data], 'chains'))}` : null,
            airmaxEnabled: am.enabled != null ? !!am.enabled : undefined,
            _rawJson: (() => { try { return JSON.stringify(JSON.parse(output), null, 2).slice(0, 8000); } catch { return null; } })(),
        };
    } catch {
        try {
            const kv = {}; output.split('\n').forEach(line => { const eq = line.indexOf('='); if (eq > 0) kv[line.slice(0, eq).trim().toLowerCase()] = line.slice(eq + 1).trim(); });
            if (Object.keys(kv).length > 0) {
                // Misma heurística de toMbps para el parser fallback KV
                const toMbps = raw => {
                    if (raw == null || raw === '') return null;
                    const v = parseInt(raw);
                    if (isNaN(v) || v < 0) return null;
                    if (v > 1_700_000) return Math.round(v / 1_000_000);
                    if (v > 1_700)     return Math.round(v / 1_000);
                    return v;
                };
                const toCCQ = v => v != null ? parseFloat((parseInt(v) / 10).toFixed(1)) : null;
                const kget = (...keys) => { for (const k of keys) { const v = kv[k]; if (v != null && v !== '') return v; } return null; };
                const kgetN = (...keys) => { for (const k of keys) { if (kv[k] != null && kv[k] !== '') return kv[k]; } return null; };
                const upSec = parseInt(kget('uptime', 'up_time'));
                let uptimeStr = null;
                if (!isNaN(upSec)) {
                    const d = Math.floor(upSec / 86400), hh = Math.floor((upSec % 86400) / 3600), mm = Math.floor((upSec % 3600) / 60), ss = upSec % 60;
                    uptimeStr = d > 0 ? `${d}d ${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}` : `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
                }
                const sigRaw = kgetN('signal', 'rssi');
                const noRaw  = kgetN('noisefloor', 'noise_floor');
                const cpuRaw = kgetN('cpu', 'cpuload', 'cpu_load');
                const txpRaw = kgetN('txpower', 'tx_power');
                const bwRaw  = kgetN('chanbw', 'channel_width', 'bw');
                return {
                    signal:      sigRaw  != null ? parseInt(sigRaw)  : null,
                    noiseFloor:  noRaw   != null ? parseInt(noRaw)   : null,
                    ccq:         toCCQ(kget('ccq', 'txccq')),
                    txRate:      toMbps(kget('txrate', 'tx.rate')),
                    rxRate:      toMbps(kget('rxrate', 'rx.rate')),
                    cpuLoad:     cpuRaw  != null ? parseInt(cpuRaw)  : null,
                    txPower:     txpRaw  != null ? parseInt(txpRaw)  : null,
                    channelWidth: bwRaw  != null ? parseInt(bwRaw)   : null,
                    uptimeStr,
                    frequency:   parseInt(kget('frequency', 'freq')) || null,
                    essid:       kget('essid', 'ssid') || null,
                    mode:        kget('mode', 'wmode') || null,
                    deviceName:  kget('hostname', 'name') || null,
                    deviceModel: kget('devmodel', 'product') || null,
                    firmwareVersion: kget('fwversion', 'version') || null,
                    wlanMac: (kget('wlan.mac', 'wlanmac', 'mac') || '').toUpperCase() || null,
                    lanMac:  (kget('lan.mac', 'lanmac') || '').toUpperCase() || null,
                    apMac:   (kget('apmac', 'ap.mac', 'bssid') || '').toUpperCase() || null,
                    airmaxEnabled: kget('airmax.status', 'airmax') === 'enabled' || undefined,
                    stations: [],
                };
            }
        } catch { }
        return { raw: output.slice(0, 3000) };
    }
};

// ── Parser para /tmp/system.cfg (key=value de airOS) ─────────────────────
const parseSystemCfg = (cfgText) => {
    if (!cfgText || typeof cfgText !== 'string' || cfgText.trim() === '') return {};
    const kv = {};
    cfgText.split('\n').forEach(line => {
        const eq = line.indexOf('=');
        if (eq > 0) kv[line.slice(0, eq).trim().toLowerCase()] = line.slice(eq + 1).trim();
    });

    // Busca en radio.1.KEY, radio.2.KEY y radio.KEY
    const r = (...suffixes) => {
        for (const pfx of ['radio.1', 'radio.2', 'radio']) {
            for (const s of suffixes) {
                const v = kv[`${pfx}.${s}`];
                if (v != null && v !== '') return v;
            }
        }
        return null;
    };
    const get = (...keys) => { for (const k of keys) { const v = kv[k]; if (v != null && v !== '') return v; } return null; };

    const rawMode = r('mode');
    let mode = null;
    if (rawMode) {
        const m = rawMode.toLowerCase();
        if (['master', 'ap', 'apauto', 'ap-ptp', 'ap-ptmp'].includes(m)) mode = 'ap';
        else if (['station', 'sta', 'managed'].includes(m)) mode = 'sta';
        else mode = rawMode;
    }

    const freqRaw  = r('freq', 'frequency');
    const bwRaw    = r('chanbw', 'channel_width', 'bw');
    const txpRaw   = r('txpower', 'tx_power');
    const freq     = freqRaw  ? parseInt(freqRaw)  : null;
    const chanbw   = bwRaw    ? parseInt(bwRaw)    : null;
    const txPower  = txpRaw   ? parseInt(txpRaw)   : null;
    const amRaw    = get('airmaxac.status', 'airmax.status', 'radio.1.airmaxac.status', 'radio.1.airmax.status');

    return {
        mode,
        networkMode:    get('netmode', 'network.1.role') || null,
        security:       r('security') || null,
        frequency:      isNaN(freq)   ? null : freq,
        channelWidth:   isNaN(chanbw) ? null : chanbw,
        txPower:        isNaN(txPower)? null : txPower,
        deviceName:     get('resolv.host.1.name', 'system.hostname', 'syslog.devname') || null,
        essid:          r('ssid') || null,
        airmaxEnabled:  amRaw != null ? (amRaw === 'enabled' || amRaw === '1') : undefined,
    };
};

// ── Parser para ifconfig (obtiene MACs de ath0/eth0) ─────────────────────
const parseIfconfig = (ifcText) => {
    if (!ifcText || typeof ifcText !== 'string') return {};
    const result = { wlanMac: null, lanMac: null };
    // Cada bloque empieza por un nombre de interfaz al inicio de línea
    const blocks = ifcText.split(/\n(?=[a-zA-Z])/);
    for (const block of blocks) {
        const nameMatch = block.match(/^([a-zA-Z0-9._-]+)/);
        if (!nameMatch) continue;
        const ifName = nameMatch[1].toLowerCase();
        const hwMatch = block.match(/HWaddr\s+([\dA-Fa-f:]{17})/i)
                     || block.match(/ether\s+([\dA-Fa-f:]{17})/i);
        if (!hwMatch) continue;
        const mac = hwMatch[1].toUpperCase();
        if (/^(ath|wlan|wifi|ra\d)/.test(ifName) && !result.wlanMac) result.wlanMac = mac;
        else if (/^(eth|br|lan)/.test(ifName)     && !result.lanMac)  result.lanMac  = mac;
    }
    return result;
};

// ── Parser para /proc/net/dev (tráfico TX/RX por interfaz) ───────────────
const parseNetDev = (text) => {
    if (!text || typeof text !== 'string') return null;
    const ifaces = {};
    for (const line of text.split('\n')) {
        // formato: "  ath0:rxB rxP ... txB txP ..."
        const m = line.match(/^\s*([\w.]+):\s*(\d+)\s+(\d+)\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+(\d+)\s+(\d+)/);
        if (m && m[1] !== 'lo') {
            ifaces[m[1]] = {
                rxBytes:   parseInt(m[2]),
                rxPackets: parseInt(m[3]),
                txBytes:   parseInt(m[4]),
                txPackets: parseInt(m[5]),
            };
        }
    }
    return Object.keys(ifaces).length > 0 ? ifaces : null;
};

// ── Parser para /proc/meminfo ─────────────────────────────────────────────
const parseMeminfo = (text) => {
    if (!text || typeof text !== 'string') return {};
    const kb = (key) => {
        const m = text.match(new RegExp(`${key}:\\s*(\\d+)\\s*kB`, 'i'));
        return m ? parseInt(m[1]) : null;
    };
    return {
        memTotalKb:   kb('MemTotal'),
        memFreeKb:    kb('MemFree'),
        memBuffersKb: kb('Buffers'),
        memCachedKb:  kb('Cached'),
    };
};

// ── Parser para iwconfig ath0 ─────────────────────────────────────────────
const parseIwconfigData = (text) => {
    if (!text || typeof text !== 'string') return {};
    const m = (rx) => { const r = text.match(rx); return r ? r[1] : null; };
    const result = {};
    const essid   = m(/ESSID:"([^"]+)"/);
    const freqGhz = m(/Frequency:(\d+\.?\d*)\s*GHz/i);
    const apMac   = m(/Access Point:\s*([\dA-Fa-f:]{17})/i);
    const bitRate = m(/Bit Rate[=:](\d+(?:\.\d+)?)\s*Mb/i);
    const txPwr   = m(/Tx-Power[=:](\d+)\s*dBm/i);
    const sig     = m(/Signal level[=:](-?\d+)\s*dBm/i);
    if (essid)   result.essid     = essid;
    if (freqGhz) result.frequency = Math.round(parseFloat(freqGhz) * 1000);
    if (apMac)   result.apMac     = apMac.toUpperCase();
    if (bitRate) result.txRate    = parseFloat(bitRate);
    if (txPwr)   result.txPower   = parseInt(txPwr);
    if (sig)     result.signal    = parseInt(sig);
    return result;
};

// ── Parser principal: fusiona las 12 fuentes de datos ────────────────────
const VALID_MARKERS = new Set(['MCA','CFG','HN','VER','IFC','UNAME','MEMINFO','ROUTES','IWCFG','WSTA','MCACLI','NETDEV']);

const parseFullOutput = (combined) => {
    const sections = {};
    let cur = null;
    for (const line of combined.split('\n')) {
        const m = line.match(/^__(MCA|CFG|HN|VER|IFC|UNAME|MEMINFO|ROUTES|IWCFG|WSTA|MCACLI|NETDEV)__\s*$/);
        if (m && VALID_MARKERS.has(m[1])) { cur = m[1]; sections[cur] = ''; continue; }
        if (cur) sections[cur] += line + '\n';
    }

    const s   = (k) => (sections[k] || '').trim();
    const s1  = (k) => s(k).split('\n')[0].trim(); // primera línea

    const mcaRaw    = s('MCA');
    const cfgRaw    = s('CFG');
    const hnRaw     = s1('HN');
    const verRaw    = s1('VER');
    const ifcRaw    = s('IFC');
    const unameRaw  = s('UNAME');
    const meminfoRaw= s('MEMINFO');
    const routesRaw = s('ROUTES');
    const iwcfgRaw  = s('IWCFG');
    const wstaRaw   = s('WSTA');
    const mcacliRaw = s('MCACLI');
    const netdevRaw = s('NETDEV');

    const base    = parseAirOSStats(mcaRaw || '{}');
    const cfg     = parseSystemCfg(cfgRaw);
    const ifc     = parseIfconfig(ifcRaw);
    const iwc     = parseIwconfigData(iwcfgRaw);
    const mem     = parseMeminfo(meminfoRaw);
    const traffic = parseNetDev(netdevRaw);

    const fill = (a, b) => (a != null && a !== '') ? a : (b != null && b !== '') ? b : null;

    return {
        ...base,
        deviceName:      hnRaw     || base.deviceName      || cfg.deviceName,
        firmwareVersion: verRaw    || base.firmwareVersion,
        mode:            fill(base.mode,        fill(cfg.mode,    iwc.mode)),
        networkMode:     fill(base.networkMode, cfg.networkMode),
        essid:           fill(base.essid,       fill(cfg.essid,   iwc.essid)),
        security:        fill(base.security,    cfg.security),
        frequency:       base.frequency    != null ? base.frequency    : (cfg.frequency    ?? iwc.frequency ?? null),
        channelWidth:    base.channelWidth != null ? base.channelWidth : (cfg.channelWidth ?? null),
        txPower:         base.txPower      != null ? base.txPower      : (cfg.txPower      ?? iwc.txPower  ?? null),
        airmaxEnabled:   base.airmaxEnabled != null ? base.airmaxEnabled : cfg.airmaxEnabled,
        wlanMac:         fill(base.wlanMac, ifc.wlanMac),
        lanMac:          fill(base.lanMac,  ifc.lanMac),
        apMac:           fill(base.apMac,   iwc.apMac),
        signal:          base.signal  != null ? base.signal  : (iwc.signal  ?? null),
        txRate:          base.txRate  != null ? base.txRate  : (iwc.txRate  ?? null),
        // Memoria detallada (/proc/meminfo)
        ...mem,
        // Tráfico TX/RX por interfaz (/proc/net/dev)
        ifaceTraffic: traffic,
        // Secciones raw — solo para diagnóstico en sesión, NO se guardan en DB
        _rawUname:    unameRaw   || null,
        _rawRoutes:   routesRaw  || null,
        _rawIwconfig: iwcfgRaw   || null,
        _rawWstalist: wstaRaw    || null,
        _rawMcaCli:   mcacliRaw  || null,
        _rawNetDev:   netdevRaw  || null,
        _rawMeminfo:  meminfoRaw || null,
    };
};

const trySshCredentials = async (ip, credentialsArray) => {
    if (!credentialsArray || !credentialsArray.length) return null;
    for (const cred of credentialsArray) {
        if (!cred.user || !cred.pass) continue;
        try {
            // Comando combinado: 5 fuentes de datos en una sola conexión SSH
            const output = await sshExec(ip, 22, cred.user, cred.pass, ANTENNA_CMD, 20000, 8000);
            const stats = parseFullOutput(output);
            console.log(`[AUTO-SSH] ✓ Éxito en ${ip} usando la clave de: ${cred.user}`);
            return { user: cred.user, pass: cred.pass, port: 22, stats };
        } catch (err) {
            console.log(`[AUTO-SSH] ✗ Falló en ${ip} con ${cred.user} -> ${err.message}`);
            continue;
        }
    }
    return null;
};

module.exports = { IPV4_REGEX, CIDR_REGEX, getSubnetHosts, probeUbiquiti, sshExec, parseAirOSStats, parseFullOutput, ANTENNA_CMD, trySshCredentials };